import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '../store/useToast';
import { voiceErrorMessage, voiceLanguage } from './voiceErrors';

type SpeechLib = typeof import('expo-speech-recognition');

/**
 * expo-speech-recognition is a native module. A build made before it was added (or Expo Go) does not contain it, so it is
 * loaded defensively: without it the mic simply says voice search is not available instead of crashing the app.
 */
let lib: SpeechLib | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  lib = require('expo-speech-recognition') as SpeechLib;
} catch {
  lib = null;
}

// Chosen once at load, so the hook below always calls the same hooks in the same order.
const useSpeechEvent: SpeechLib['useSpeechRecognitionEvent'] = lib ? lib.useSpeechRecognitionEvent : ((() => undefined) as never);

const deviceLocale = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().locale; } catch { return undefined; }
};

const available = () => {
  try { return !!lib && lib.ExpoSpeechRecognitionModule.isRecognitionAvailable(); } catch { return false; }
};

/**
 * Voice search for the search box. Tapping the mic asks for the microphone only now (never at app start), listens once,
 * and reports the words as they are recognised (`final` is true for the finished sentence). Every failure is explained.
 */
export function useVoiceSearch(onText: (text: string, final: boolean) => void) {
  const [listening, setListening] = useState(false);
  const handler = useRef(onText);
  useEffect(() => { handler.current = onText; }, [onText]);

  useSpeechEvent('start', () => setListening(true));
  useSpeechEvent('end', () => setListening(false));
  useSpeechEvent('result', (e) => {
    const text = e.results?.[0]?.transcript?.trim();
    if (text) handler.current(text, !!e.isFinal);
  });
  useSpeechEvent('error', (e) => {
    setListening(false);
    const m = voiceErrorMessage(e.error);
    if (m) toast(m.text, m.tone);
  });

  const start = useCallback(async () => {
    if (!lib || !available()) {
      toast('Voice search is not available on this device. You can still type your search.', 'info');
      return;
    }
    try {
      const perm = await lib.ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        toast(perm.canAskAgain ? 'Microphone permission is needed for voice search.' : 'Microphone is blocked for this app. Turn it on in Settings to use voice search.', 'error');
        return;
      }
      lib.ExpoSpeechRecognitionModule.start({ lang: voiceLanguage(deviceLocale()), interimResults: true, maxAlternatives: 1, continuous: false });
    } catch {
      toast('Voice search could not start. Please try again.', 'error');
    }
  }, []);

  const stop = useCallback(() => {
    try { lib?.ExpoSpeechRecognitionModule.stop(); } catch { /* already stopped */ }
  }, []);

  const toggle = useCallback(() => { if (listening) stop(); else void start(); }, [listening, start, stop]);

  return { listening, start, stop, toggle };
}
