import { Audio } from 'expo-av';
import { useState } from 'react';

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? '';
const WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions';

export function useWhisper() {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const startRecording = async () => {
    const { granted } = await Audio.requestPermissionsAsync();
    if (!granted) throw new Error('Microphone permission denied');

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const { recording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY,
    );
    setRecording(recording);
    setIsRecording(true);
  };

  const stopRecording = async (): Promise<string> => {
    if (!recording) return '';

    setIsRecording(false);
    await recording.stopAndUnloadAsync();
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

    const uri = recording.getURI();
    setRecording(null);
    if (!uri) return '';

    setIsTranscribing(true);
    try {
      return await transcribe(uri);
    } finally {
      setIsTranscribing(false);
    }
  };

  return { startRecording, stopRecording, isRecording, isTranscribing, isAvailable: true };
}

async function transcribe(uri: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', { uri, type: 'audio/m4a', name: 'recording.m4a' } as any);

  formData.append('model', 'whisper-1');

  const response = await fetch(WHISPER_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Whisper error: ${err}`);
  }

  const data = await response.json();
  return data.text ?? '';
}
