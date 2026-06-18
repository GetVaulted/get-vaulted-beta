export function avatarUrlWithCacheBust(publicUrl: string, versionMs = Date.now()): string {
  const trimmed = publicUrl.trim();
  if (!trimmed) return trimmed;
  const sep = trimmed.includes('?') ? '&' : '?';
  return `${trimmed}${sep}v=${versionMs}`;
}

export type AvatarCropRect = {
  originX: number;
  originY: number;
  width: number;
  height: number;
};

/** Map pan/zoom in a circular crop viewport back to a square crop in source image space. */
export function computeAvatarCropRect(args: {
  imageWidth: number;
  imageHeight: number;
  viewportSize: number;
  userScale: number;
  offsetX: number;
  offsetY: number;
}): AvatarCropRect {
  const { imageWidth, imageHeight, viewportSize, userScale, offsetX, offsetY } = args;
  const baseScale = Math.max(viewportSize / imageWidth, viewportSize / imageHeight);
  const totalScale = baseScale * userScale;
  const displayedW = imageWidth * totalScale;
  const displayedH = imageHeight * totalScale;
  const left = (viewportSize - displayedW) / 2 + offsetX;
  const top = (viewportSize - displayedH) / 2 + offsetY;

  let originX = Math.round(Math.max(0, -left / totalScale));
  let originY = Math.round(Math.max(0, -top / totalScale));
  let width = Math.round(Math.min(imageWidth - originX, viewportSize / totalScale));
  let height = Math.round(Math.min(imageHeight - originY, viewportSize / totalScale));
  const side = Math.min(width, height);
  width = side;
  height = side;

  if (originX + width > imageWidth) originX = Math.max(0, imageWidth - width);
  if (originY + height > imageHeight) originY = Math.max(0, imageHeight - height);

  return { originX, originY, width, height };
}
