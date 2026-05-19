import * as ImageManipulator from 'expo-image-manipulator';

const MAX_WIDTH = 1200;
const JPEG_QUALITY = 0.82;

export function isRemoteListingImageUri(uri: string): boolean {
  return /^https?:\/\//i.test(uri);
}

/** Resize and JPEG-compress local listing photos before upload. */
export async function prepareListingPhotoForUpload(uri: string): Promise<string> {
  if (isRemoteListingImageUri(uri)) return uri;
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: MAX_WIDTH } }],
    { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
}
