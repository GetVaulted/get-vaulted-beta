/** Seller host camera defaults — IVS SDK initializes front; we swap once to rear after init. */
export type SellerCameraFacing = 'front' | 'back';

export const SELLER_DEFAULT_CAMERA_FACING: SellerCameraFacing = 'back';

/** Front camera preview is mirrored; rear camera is not. */
export function sellerPreviewMirror(facing: SellerCameraFacing): boolean {
  return facing === 'front';
}

export function cameraPermissionDeniedMessage(): string {
  return 'Camera and microphone access is required to preview and go live. Enable both in Settings, then tap Retry.';
}

export function cameraPermissionUnavailableMessage(): string {
  return 'This device does not support camera capture for live streaming.';
}
