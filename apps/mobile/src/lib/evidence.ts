import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { COMPRESS, MIN_PROOF_BYTES, proofPath, type EvidenceSource } from '@/data/evidenceModel';
import { supabase } from '@/lib/supabase';

/**
 * Evidence capture, upload and submission — the native replacement for the web
 * client's VerificationModal.
 *
 * The web version captured a frame from getUserMedia into a canvas and ran a
 * pixel-level blank-frame check there. None of that exists in React Native.
 * Here the camera and library come from expo-image-picker, compression from
 * expo-image-manipulator, and the blank guard is a byte-size floor that mirrors
 * the server's own check in api/_lib/verify.js — which is the one that applies
 * to every client anyway.
 *
 * Nothing in this file awards a point. `submit_completion()` is the only path
 * that does, and it runs on the server.
 */

export type CapturedImage = {
  uri: string;
  bytes: number;
  width: number;
  height: number;
  source: EvidenceSource;
};

export type CaptureResult =
  | { ok: true; image: CapturedImage }
  | { ok: false; reason: 'cancelled' | 'permission' | 'error'; message?: string };

/**
 * Open the camera (source 'camera') or the photo library (source 'upload'),
 * then compress the result to the study's target size.
 *
 * Permissions are requested lazily, on first use, so a participant is asked
 * when the request makes sense rather than at launch.
 */
export async function captureEvidence(source: EvidenceSource): Promise<CaptureResult> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return {
      ok: false,
      reason: 'permission',
      message:
        source === 'camera'
          ? 'Camera access is off. Enable it for PetQuest in Settings to take a photo.'
          : 'Photo access is off. Enable it for PetQuest in Settings to choose a photo.',
    };
  }

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: false,
    // We compress ourselves below; asking the picker for full quality avoids a
    // double JPEG pass that would soften handwriting.
    quality: 1,
    exif: false,
  };

  let result: ImagePicker.ImagePickerResult;
  try {
    result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
  } catch (e: unknown) {
    return { ok: false, reason: 'error', message: e instanceof Error ? e.message : 'Could not open the picker.' };
  }

  if (result.canceled || !result.assets?.[0]?.uri) return { ok: false, reason: 'cancelled' };

  try {
    const image = await compress(result.assets[0], source);
    return { ok: true, image };
  } catch (e: unknown) {
    return { ok: false, reason: 'error', message: e instanceof Error ? e.message : 'Could not process the photo.' };
  }
}

/**
 * Resize so the long edge is at most COMPRESS.longEdge and re-encode as JPEG.
 * A 12 MP phone photo comes down to a few hundred KB, which is plenty for
 * "does this plausibly show the task" and keeps uploads quick on mobile data.
 */
async function compress(asset: ImagePicker.ImagePickerAsset, source: EvidenceSource): Promise<CapturedImage> {
  const w = asset.width ?? 0;
  const h = asset.height ?? 0;
  const longEdge = Math.max(w, h);
  const resize =
    longEdge > COMPRESS.longEdge
      ? w >= h
        ? { width: COMPRESS.longEdge }
        : { height: COMPRESS.longEdge }
      : null;

  const out = await ImageManipulator.manipulateAsync(
    asset.uri,
    resize ? [{ resize }] : [],
    { compress: COMPRESS.quality, format: ImageManipulator.SaveFormat.JPEG },
  );

  const bytes = await byteLengthOf(out.uri);
  return { uri: out.uri, bytes, width: out.width, height: out.height, source };
}

/** Size of a local file, read the same way the upload will read it. */
async function byteLengthOf(uri: string): Promise<number> {
  const buf = await readBytes(uri);
  return buf.byteLength;
}

/**
 * Read a local file: URI into memory. RN's fetch handles file:// URIs, and
 * ArrayBuffer is the one body type supabase-js uploads reliably from React
 * Native (a RN Blob can arrive at the server as zero bytes).
 */
async function readBytes(uri: string): Promise<ArrayBuffer> {
  const res = await fetch(uri);
  return res.arrayBuffer();
}

export type UploadResult = { ok: true; path: string } | { ok: false; message: string };

/**
 * Upload to the private `quest-proofs` bucket under the caller's own folder.
 * The bucket's INSERT policy requires the first path segment to be the caller's
 * uid, so a wrong `userId` is refused by the database, not by this code.
 */
export async function uploadEvidence(userId: string, taskId: string, image: CapturedImage): Promise<UploadResult> {
  let bytes: ArrayBuffer;
  try {
    bytes = await readBytes(image.uri);
  } catch {
    return { ok: false, message: 'Could not read the photo. Please retake it.' };
  }

  // Same floor as the server. Catching it here saves a doomed upload.
  if (bytes.byteLength < MIN_PROOF_BYTES) {
    return { ok: false, message: 'That photo looks empty — please retake it.' };
  }

  const path = proofPath(userId, taskId);
  const { error } = await supabase.storage
    .from('quest-proofs')
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });

  if (error) return { ok: false, message: friendlyUpload(error.message) };
  return { ok: true, path };
}

export type SubmitResult =
  | { ok: true; completionId: string; awarded: number; points: number; raw: Record<string, unknown> }
  | { ok: false; code: string };

/**
 * `submit_completion()` — the ONLY way a quest is completed and a point awarded.
 *
 * It snapshots the profile, calls complete_task() with owner privilege (the RPC
 * itself is revoked from clients), records the completion row, and returns the
 * award. Everything economic happens inside it; this function just relays.
 *
 * `timeStarted` is the quest's started_at/created_at; `verificationStartedAt`
 * is when the participant opened this screen — the research "active time".
 */
export async function submitCompletion(args: {
  taskId: string;
  photoPath: string;
  log: string;
  timeStarted: string;
  verificationStartedAt: string;
  source: EvidenceSource;
}): Promise<SubmitResult> {
  const { data, error } = await supabase.rpc('submit_completion', {
    p_task_id: args.taskId,
    p_photo_path: args.photoPath,
    p_log: args.log.trim(),
    p_time_started: args.timeStarted,
    p_verification_started_at: args.verificationStartedAt,
    p_source: args.source,
  });

  if (error) {
    const m = error.message.toLowerCase();
    return { ok: false, code: m.includes('jwt') || m.includes('expired') ? 'unauthenticated' : error.message };
  }

  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok !== true) return { ok: false, code: typeof row.error === 'string' ? row.error : 'unknown' };

  return {
    ok: true,
    completionId: String(row.completion_id ?? ''),
    awarded: typeof row.awarded === 'number' ? row.awarded : 0,
    points: typeof row.points === 'number' ? row.points : 0,
    raw: row,
  };
}

function friendlyUpload(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('row-level security') || m.includes('policy')) {
    return 'The upload was refused. Please sign out and back in, then try again.';
  }
  if (m.includes('fetch') || m.includes('network') || m.includes('timeout')) {
    return 'Upload failed — check your connection and try again.';
  }
  return `Upload failed: ${message}`;
}
