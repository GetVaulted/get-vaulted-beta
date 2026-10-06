import * as ImageManipulator from 'expo-image-manipulator';
import type { AvatarCropRect } from './profileAvatarCropMath';

export { avatarUrlWithCacheBust, computeAvatarCropRect } from './profileAvatarCropMath';
export type { AvatarCropRect } from './profileAvatarCropMath';

export const PROFILE_AVATAR_UPLOAD_PX = 512;
const JPEG_QUALITY = 0.86;

/** Resize and compress a cropped avatar before upload (small payload, fast display). */
export async function prepareProfileAvatarForUpload(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: PROFILE_AVATAR_UPLOAD_PX, height: PROFILE_AVATAR_UPLOAD_PX } }],
    { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
}

export async function cropAvatarImage(uri: string, crop: AvatarCropRect): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ crop: crop }],
    { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
}

export const PROFILE_BANNER_UPLOAD_PX = 1200;

/** Resize a banner photo to a sensible width and compress it before upload. */
export async function prepareProfileBannerForUpload(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: PROFILE_BANNER_UPLOAD_PX } }],
    { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
}
