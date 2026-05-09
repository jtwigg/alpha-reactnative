import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Drop any audio file at packages/server/tests/fixtures/test-audio.m4a (or .wav, .mp3, .webm)
const FIXTURE_DIR = join(__dirname, 'fixtures');
const AUDIO_EXTENSIONS = ['m4a', 'wav', 'mp3', 'webm', 'ogg'];

function findAudioFixture(): { path: string; ext: string } | null {
  for (const ext of AUDIO_EXTENSIONS) {
    const p = join(FIXTURE_DIR, `test-audio.${ext}`);
    if (existsSync(p)) return { path: p, ext };
  }
  return null;
}

const MIME: Record<string, string> = {
  m4a: 'audio/m4a',
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  webm: 'audio/webm',
  ogg: 'audio/ogg',
};

describe('whisper (e2e)', () => {
  it('transcribes audio via OpenAI Whisper API', async () => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY env var required');

    const fixture = findAudioFixture();
    if (!fixture) throw new Error(
      'No audio fixture found. Record something and save it to packages/server/tests/fixtures/test-audio.m4a (or .wav/.mp3/.webm)'
    );

    const buffer = readFileSync(fixture.path);
    const blob = new Blob([buffer], { type: MIME[fixture.ext] });

    const formData = new FormData();
    formData.append('file', blob, `test-audio.${fixture.ext}`);
    formData.append('model', 'whisper-1');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    const body = await response.text();
    expect(response.ok, `Whisper API error: ${body}`).toBe(true);

    const data = JSON.parse(body);
    expect(typeof data.text).toBe('string');
    console.log('Transcript:', data.text);
  });
});
