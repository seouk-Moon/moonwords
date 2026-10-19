export type PhotoCrop = { x: number; y: number; width: number; height: number };
export const FULL_PHOTO: PhotoCrop = { x: 0, y: 0, width: 1, height: 1 };
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;

export function validatePhoto(file: { type: string; name: string; size: number }) {
  if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) throw new Error('사진 파일을 선택해 주세요.');
  if (file.size > MAX_PHOTO_BYTES) throw new Error('사진은 20MB 이하로 선택해 주세요.');
  if (!file.size) throw new Error('사진 파일이 비어 있어요. 다시 촬영해 주세요.');
}

export function clampPhotoCrop(crop: PhotoCrop): PhotoCrop {
  const finite = (n: number, fallback: number) => Number.isFinite(n) ? n : fallback;
  const x = Math.max(0, Math.min(.99, finite(crop.x, 0)));
  const y = Math.max(0, Math.min(.99, finite(crop.y, 0)));
  return { x, y, width: Math.max(.01, Math.min(1 - x, finite(crop.width, 1))), height: Math.max(.01, Math.min(1 - y, finite(crop.height, 1))) };
}

export function photoCropFromPoints(start: { x: number; y: number }, end: { x: number; y: number }) {
  return clampPhotoCrop({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) });
}
