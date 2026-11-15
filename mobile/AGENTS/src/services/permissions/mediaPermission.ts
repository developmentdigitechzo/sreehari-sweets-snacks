/**
 * Choosing a photo from the library needs NO permission and the app asks for none.
 *
 * Expo's image picker opens the system photo picker (Android Photo Picker, iOS PHPicker). The customer picks the
 * photos in a system screen and the app receives only those files; it never gets access to the whole library. So there
 * is deliberately no "media library" permission, no READ_MEDIA_* / storage permission on Android and no photo-library
 * prompt on iOS. Requesting it would only widen access for no benefit.
 */
export const MEDIA_LIBRARY_NEEDS_PERMISSION = false;

export { IMAGE_RULES } from './logic';
