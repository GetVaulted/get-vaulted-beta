import * as ImageManipulator from 'expo-image-manipulator';

const MAX_WIDTH = 1600;
const JPEG_QUALITY = 0.85;

/**
 * Resize and JPEG-compress a picked DM photo before upload.
 *
 * `uploadThreadImage` always sends `contentType: 'image/jpeg'` to
 * `/api/uploads/message-image`, which validates the uploaded bytes against that claimed type via
 * a magic-number check (`magicMatches`) and rejects anything that doesn't match with "File does
 * not match its type." Without this step, a photo picked straight from the library keeps its
 * original on-disk format — commonly HEIC (the default iPhone camera format, not even in the
 * server's allowed list) or PNG (screenshots) — so the claimed/actual mismatch made sending
 * almost any non-JPEG photo fail immediately. Re-encoding through ImageManipulator here
 * guarantees the bytes are genuinely JPEG before upload, same fix already applied to avatar and
 * listing photo uploads (see `prepareProfileAvatarForUpload` / `prepareListingPhotoForUpload`).
 */
export async function prepareMessageImageForUpload(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: MAX_WIDTH } }],
    { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
}
