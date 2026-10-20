export const USER_NOTES_FOLDER = '.Open-Git-Control/notes-to-user';
export const USER_NOTES_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
export const MAX_USER_NOTE_BYTES = 256 * 1024;
export const MAX_USER_NOTE_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_USER_NOTE_IMAGES = 256;
export const USER_NOTE_IMAGE_DATA_URL = /^data:image\/(?:png|jpeg|gif|webp|avif|bmp);base64,[A-Za-z0-9+/]*={0,2}$/;

export type UserNoteIdentity = { id: string; revision: string };
export type UserNoteSummaryDto = UserNoteIdentity & { title: string; acknowledged: boolean };
export type UserNoteDto = UserNoteIdentity & { markdown: string; images: Record<string, string> };
export type UserNotesStatusDto = {
  state: 'idle' | 'checking' | 'ready' | 'error';
  notes: UserNoteSummaryDto[];
  lastCheckedAt: number | null;
  error: string | null;
};

export function isUserNoteId(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length <= 255 && !/[\\/]/.test(value) && ![...value].some((char) => char.charCodeAt(0) < 32) && /^.+\.md$/i.test(value)
  );
}

/** Resolves relative or repository-root references, never outside the notice folder. */
export function resolveUserNoteImagePath(reference: string): string | null {
  if (!reference || /^[a-z][a-z0-9+.-]*:/i.test(reference.trim()) || reference.startsWith('//')) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(reference.trim().split(/[?#]/, 1)[0]);
  } catch {
    return null;
  }
  if (!decoded || decoded.includes('\\') || [...decoded].some((char) => char.charCodeAt(0) < 32)) return null;
  const segments = decoded.startsWith('/') ? [] : USER_NOTES_FOLDER.split('/');
  for (const segment of decoded.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') segments.pop();
    else segments.push(segment);
  }
  const resolved = segments.join('/');
  return resolved.startsWith(`${USER_NOTES_FOLDER}/`) ? resolved : null;
}
