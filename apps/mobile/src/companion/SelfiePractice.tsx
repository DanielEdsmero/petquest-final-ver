import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

/**
 * The practice selfie in the first-login tour.
 *
 * PRIVACY: practice only. The photo is held in this component's state, shown on this
 * screen and dropped when the step ends. It is never uploaded, never written to the
 * photo library and never logged, and nothing in this file talks to the network or to
 * Supabase (tests/companion.test.ts checks that). The study collects no personal
 * identifiers, so this must stay true.
 *
 * It uses the system camera (expo-image-picker), like the real proof flow, so the
 * practice teaches the real thing. The camera opens only when the student taps.
 */

export default function SelfiePractice({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const [uri, setUri] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const open = async () => {
    setBusy(true);
    setBlocked(null);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setBlocked('Camera access is off. You can turn it on in Settings, or skip the selfie.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        cameraType: ImagePicker.CameraType.front,
        allowsEditing: false,
        quality: 0.4,
        exif: false,
      });
      if (!result.canceled && result.assets?.[0]?.uri) setUri(result.assets[0].uri);
    } catch {
      setBlocked('The camera could not open. You can skip the selfie.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.frame}>
        {uri ? (
          <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel="Your practice shot" />
        ) : (
          <View style={styles.oval} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
        )}
      </View>

      <View style={styles.note} accessibilityRole="text">
        <Text style={styles.noteText}>🔒 Practice only. This photo stays on your phone. It is never uploaded or saved to your photos.</Text>
      </View>

      {blocked ? <Text style={styles.blocked}>{blocked}</Text> : null}

      <View style={styles.row}>
        {uri ? (
          <>
            <Pressable onPress={onDone} accessibilityRole="button" style={[styles.btn, styles.primary, styles.grow]}>
              <Text style={styles.primaryText}>Looks good</Text>
            </Pressable>
            <Pressable onPress={open} accessibilityRole="button" style={[styles.btn, styles.secondary]}>
              <Text style={styles.secondaryText}>Retake</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable onPress={open} disabled={busy} accessibilityRole="button" style={[styles.btn, styles.primary, styles.grow, busy && styles.dim]}>
              <Text style={styles.primaryText}>{busy ? 'Opening…' : 'Open camera'}</Text>
            </Pressable>
            <Pressable onPress={onSkip} accessibilityRole="button" style={[styles.btn, styles.secondary]}>
              <Text style={styles.secondaryText}>Skip</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  frame: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#B9CBC8', aspectRatio: 4 / 3, alignItems: 'center', justifyContent: 'center' },
  oval: { height: '78%', aspectRatio: 3 / 4, borderRadius: 999, borderWidth: 3, borderColor: 'rgba(255,255,255,0.95)', borderStyle: 'dashed' },
  note: { backgroundColor: '#E4EFEE', borderRadius: 10, padding: 10 },
  noteText: { color: '#3E5165', fontSize: 12, lineHeight: 17, fontWeight: '600' },
  blocked: { color: '#102A43', fontSize: 13, lineHeight: 18, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 8 },
  grow: { flex: 1 },
  btn: { minHeight: 48, borderRadius: 12, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: '#3F8580' },
  primaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  secondary: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5D0' },
  secondaryText: { color: '#2F6F6B', fontSize: 15, fontWeight: '800' },
  dim: { opacity: 0.6 },
});
