import { REPOSITORY_ICON_SIZE } from '@/shared/repositoryIcons';

export async function createRepositoryIconThumbnail(dataUrl: string): Promise<string> {
  if (!/^data:image\/[a-z0-9.+-]+;base64,/i.test(dataUrl)) throw new Error('Invalid repository image.');
  const image = new Image();
  image.decoding = 'async';
  image.src = dataUrl;
  await image.decode();
  if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 16 * 1024 * 1024)
    throw new Error('Repository image dimensions are too large.');
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = REPOSITORY_ICON_SIZE;
  const drawing = canvas.getContext('2d');
  if (!drawing) throw new Error('Image preview could not be generated.');
  const scale = Math.min(REPOSITORY_ICON_SIZE / image.naturalWidth, REPOSITORY_ICON_SIZE / image.naturalHeight);
  const width = image.naturalWidth * scale,
    height = image.naturalHeight * scale;
  drawing.drawImage(image, (REPOSITORY_ICON_SIZE - width) / 2, (REPOSITORY_ICON_SIZE - height) / 2, width, height);
  return canvas.toDataURL('image/png');
}
