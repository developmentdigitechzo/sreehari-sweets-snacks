import assert from 'node:assert/strict';
import { test } from 'node:test';
import { voiceErrorMessage, voiceLanguage } from './voiceErrors';

test('voice: stopping it yourself is silent, every real failure has a plain message', () => {
  assert.equal(voiceErrorMessage('aborted'), null);
  for (const code of ['no-speech', 'not-allowed', 'service-not-allowed', 'language-not-supported', 'network', 'audio-capture', 'something-new', undefined]) {
    const m = voiceErrorMessage(code);
    assert.ok(m && m.text.length > 10, `message for ${code}`);
  }
  assert.equal(voiceErrorMessage('no-speech')?.tone, 'info');
  assert.equal(voiceErrorMessage('network')?.tone, 'error');
});

test('voice: Tamil phones listen for Tamil, others for Indian English', () => {
  assert.equal(voiceLanguage('ta-IN'), 'ta-IN');
  assert.equal(voiceLanguage('ta'), 'ta-IN');
  assert.equal(voiceLanguage('en-US'), 'en-IN');
  assert.equal(voiceLanguage('tr-TR'), 'en-IN'); // Turkish must not be mistaken for Tamil
  assert.equal(voiceLanguage(undefined), 'en-IN');
});
