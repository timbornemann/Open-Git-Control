export const MAX_RENDER_CHARS = 2 * 1024 * 1024;
export const MAX_RENDER_LINES = 5000;
export const MAX_SINGLE_LINE_LENGTH = 2000;

const BINARY_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'bmp',
  'webp',
  'ico',
  'pdf',
  'zip',
  'gz',
  '7z',
  'rar',
  'exe',
  'dll',
  'so',
  'dylib',
  'woff',
  'woff2',
  'ttf',
  'otf',
  'mp3',
  'wav',
  'mp4',
  'mov',
]);

export const toShortHash = (value: string | undefined) => (value || '').slice(0, 8);

export const getExtension = (filePath: string) => {
  const fileName = filePath.split(/[\\/]/).pop() || filePath;
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === fileName.length - 1) {
    return '';
  }
  return fileName.slice(lastDot + 1).toLowerCase();
};

export const looksBinaryByExtension = (filePath: string): boolean => BINARY_EXTENSIONS.has(getExtension(filePath));
