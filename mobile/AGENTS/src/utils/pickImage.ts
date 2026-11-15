import * as ImagePicker from 'expo-image-picker';
import { ensurePermission } from '../services/permissions/permissionService';
import { IMAGE_RULES, imageProblem } from '../services/permissions/logic';

export const MAX_IMAGE_BYTES = IMAGE_RULES.maxBytes;

export type PickResult = { ok: true; uri: string; bytes?: number } | { ok: false; reason: string } | { ok: 'cancelled' };

/**
 * Pick from the library or capture with the camera.
 *
 * Library: opens the system photo picker. That needs no permission, so none is requested and the app never sees the rest
 * of the library. Camera: goes through ensurePermission, which explains why first and only then shows the system prompt.
 * Nothing is uploaded here: the caller shows the photo to the customer and only uses it after they confirm.
 * The picker compresses (quality 0.7) before we validate size, so a large original is fine when the output is within limits.
 */
export async function pickImage(source: 'library' | 'camera', opts?: { square?: boolean }): Promise<PickResult> {
  try {
    if (source === 'camera') {
      const perm = await ensurePermission('camera');
      if (perm === 'dismissed') return { ok: 'cancelled' };
      if (perm === 'unavailable') return { ok: false, reason: 'No camera is available on this device. Choose a photo from your library instead.' };
      if (perm === 'blocked') return { ok: false, reason: 'Camera access is off. Turn it on in Settings, or choose a photo from your library.' };
      if (perm !== 'granted') return { ok: false, reason: 'Camera access was not allowed. You can choose a photo from your library instead.' };
    }
    const launch = source === 'camera' ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const res = await launch({ mediaTypes: ['images'], quality: 0.7, allowsEditing: !!opts?.square, aspect: opts?.square ? [1, 1] : undefined, exif: false });
    if (res.canceled || !res.assets?.[0]) return { ok: 'cancelled' };
    const a = res.assets[0];
    const problem = imageProblem(a);
    if (problem) return { ok: false, reason: problem };
    return { ok: true, uri: a.uri, bytes: a.fileSize };
  } catch (e) {
    const msg = String((e as Error).message ?? '');
    if (source === 'camera' && /camera|unavailable|simulator|no.*device/i.test(msg)) return { ok: false, reason: 'The camera could not be opened on this device. Choose a photo from your library instead.' };
    return { ok: false, reason: msg || 'Could not open the picker.' };
  }
}
