const imageTypes: Record<string, string> = {
  apng: 'image/apng',
  avif: 'image/avif',
  bmp: 'image/bmp',
  gif: 'image/gif',
  ico: 'image/x-icon',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
};
export function repositoryImageMimeType(filePath: string): string | null {
  const extension = /\.([a-z0-9]+)$/i.exec(filePath)?.[1].toLowerCase();
  return extension ? imageTypes[extension] || null : null;
}
