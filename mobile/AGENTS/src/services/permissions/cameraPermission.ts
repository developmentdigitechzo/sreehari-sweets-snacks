import * as ImagePicker from 'expo-image-picker';
import type { PermissionAdapter } from './types';

/** Camera for taking a photo. Microphone is not requested: the app records no audio or video. */
export const cameraAdapter: PermissionAdapter = {
  get: () => ImagePicker.getCameraPermissionsAsync(),
  request: () => ImagePicker.requestCameraPermissionsAsync(),
};
