/** What to tell the customer for each speech-recognition error code. Plain text, no technical words. Pure, so it can be unit-tested. */
export function voiceErrorMessage(code: string | undefined): { text: string; tone: 'error' | 'info' } | null {
  switch (code) {
    case 'aborted':
      return null; // the customer stopped it themselves
    case 'no-speech':
      return { text: "We didn't hear anything. Tap the mic and try again.", tone: 'info' };
    case 'not-allowed':
      return { text: 'Microphone access is needed for voice search. Allow it in your settings and try again.', tone: 'error' };
    case 'service-not-allowed':
      return { text: 'Speech recognition is turned off or not available on this device.', tone: 'error' };
    case 'language-not-supported':
      return { text: 'Voice search is not available for your language on this device. You can still type your search.', tone: 'error' };
    case 'network':
      return { text: 'Voice search needs an internet connection. Check it and try again.', tone: 'error' };
    case 'audio-capture':
      return { text: 'We could not use the microphone. Close other apps that are recording and try again.', tone: 'error' };
    default:
      return { text: 'Voice search stopped. Please try again.', tone: 'error' };
  }
}

/** Tamil phones listen for Tamil, everyone else for Indian English. */
export function voiceLanguage(deviceLocale: string | undefined): 'ta-IN' | 'en-IN' {
  return /^ta\b/i.test(deviceLocale ?? '') ? 'ta-IN' : 'en-IN';
}
