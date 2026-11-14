export const MAX_RELEASE_NOTES_INSTRUCTIONS_LENGTH = 16_000;

export function normalizeReleaseNotesInstructions(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.length > MAX_RELEASE_NOTES_INSTRUCTIONS_LENGTH)
    throw new Error(`Release-note instructions must be text with at most ${MAX_RELEASE_NOTES_INSTRUCTIONS_LENGTH} characters.`);
  return value.trim();
}
