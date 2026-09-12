/*
 * Phase 12 — quest validity constants for the browser. The server-side enums
 * live in api/_lib/quest-validity.js; tests/quest-validity.test.mjs asserts the
 * two stay in sync.
 */

export const EVIDENCE_TYPES = [
  { id: 'photo',          emoji: '📷', label: 'Photo',                 desc: 'A live photo of the finished work or activity' },
  { id: 'document',       emoji: '📄', label: 'Document or file',      desc: 'Upload a file — essay, PDF, spreadsheet, code…' },
  { id: 'screenshot',     emoji: '🖥️', label: 'Screenshot',            desc: 'A screenshot of an app or site showing the result' },
  { id: 'timed_activity', emoji: '⏱️', label: 'Timed activity',        desc: 'A timed session recorded while you work' },
  { id: 'admin_review',   emoji: '🧑‍⚖️', label: 'Other (admin review)', desc: 'Other evidence, reviewed by a study admin' },
]
export const evidenceMeta = (id) => EVIDENCE_TYPES.find(e => e.id === id) || EVIDENCE_TYPES[0]

export const PRIORITIES = [
  { id: 'P1', color: '#f43f5e', label: 'Urgent' },
  { id: 'P2', color: '#f5a31a', label: 'Normal' },
  { id: 'P3', color: '#8080aa', label: 'Low' },
]

/* Row badges. `exempt` (starter quests) and `accepted` show nothing. */
export const VALIDITY_META = {
  pending_ai_review:   { label: 'Awaiting check', color: '#22d3ee', hint: 'Saved — the quality check will run shortly. You can complete it once it’s accepted.' },
  needs_clarification: { label: 'Needs changes',  color: '#f5a31a', hint: 'The quality check asked for a clearer task. Revise it to continue.' },
  rejected:            { label: 'Not accepted',   color: '#fb7185', hint: 'This quest was not accepted. Revise it or delete it.' },
}

/* A quest can be verified/completed only once it has passed (or is exempt from)
   the validity check. Rows from before Phase 12 carry no status → eligible. */
export const isQuestEligible = (t) =>
  !t?.validity_status || t.validity_status === 'accepted' || t.validity_status === 'exempt'

export const CHECK_STEPS = [
  'Checking quest quality',
  'Comparing the task with your goal',
  'Choosing the best evidence type',
  'Saving your quest',
]

export const CHECK_EXPLAINER =
  'PetQuest checks whether your quest is specific, meaningful, and possible to verify. This helps keep the study fair.'
