import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export type PhotoPickSource = 'camera' | 'library';

/** Ask whether to capture a new photo or pick from the album. */
export function promptPhotoPickSource(title = 'Add photos'): Promise<PhotoPickSource | null> {
  return new Promise((resolve) => {
    Alert.alert(title, 'Choose a source', [
      { text: 'Take picture', onPress: () => resolve('camera') },
      { text: 'Photo album', onPress: () => resolve('library') },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
}

export async function ensureLibraryPermission(): Promise<boolean> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (perm.granted) return true;
  Alert.alert('Photos', 'Allow photo library access to add listing media.');
  return false;
}

export async function ensureCameraPermission(): Promise<boolean> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (perm.granted) return true;
  Alert.alert('Camera', 'Allow camera access to take listing photos.');
  return false;
}

export async function pickPhotosFromLibrary(remaining: number) {
  if (!(await ensureLibraryPermission())) return null;
  return ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: remaining > 1,
    selectionLimit: remaining,
    quality: 0.85,
  });
}

export async function pickPhotoFromCamera() {
  if (!(await ensureCameraPermission())) return null;
  return ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.85,
  });
}

export async function pickSingleImageFromLibrary() {
  if (!(await ensureLibraryPermission())) return null;
  return ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: false,
    quality: 0.85,
  });
}
