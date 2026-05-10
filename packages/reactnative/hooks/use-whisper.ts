import { Audio } from 'expo-av';
import { useRef, useState } from 'react';

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? '';
const WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions';
const CHUNK_MS = 3000;

export function useWhisper() {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState('');

  const recordingRef = useRef<Audio.Recording | null>(null);
  const chunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accumulatedRef = useRef('');
  const activeRef = useRef(false);

  const isAvailable = true;

  const newRecording = async (): Promise<Audio.Recording> => {
    const { recording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY,
    );
    return recording;
  };

  const transcribeUri = async (uri: string): Promise<string> => {
    const formData = new FormData();
    formData.append('file', { uri, type: 'audio/m4a', name: 'chunk.m4a' } as any);
    formData.append('model', 'whisper-1');
    // Pass prior transcript as prompt so Whisper maintains context across chunks
    if (accumulatedRef.current) {
      formData.append('prompt', accumulatedRef.current.slice(-200));
    }
    const res = await fetch(WHISPER_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: formData,
    });
    if (!res.ok) return '';
    const data = await res.json();
    return (data.text ?? '').trim();
  };

  const scheduleRoll = () => {
    chunkTimerRef.current = setTimeout(async () => {
      if (!activeRef.current) return;
      const prev = recordingRef.current;
      if (!prev) return;

      // Must stop before starting a new one — iOS won't allow concurrent recordings
      await prev.stopAndUnloadAsync();
      const uri = prev.getURI();

      const next = await newRecording();
      recordingRef.current = next;
      scheduleRoll();

      // Transcribe previous chunk in background
      if (!uri) return;
      const text = await transcribeUri(uri);
      if (text && activeRef.current) {
        accumulatedRef.current += (accumulatedRef.current ? ' ' : '') + text;
        setPartialTranscript(accumulatedRef.current);
      }
    }, CHUNK_MS);
  };

  const startRecording = async () => {
    const { granted } = await Audio.requestPermissionsAsync();
    if (!granted) throw new Error('Microphone permission denied');

    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

    accumulatedRef.current = '';
    activeRef.current = true;
    setPartialTranscript('');

    recordingRef.current = await newRecording();
    scheduleRoll();
    setIsRecording(true);
  };

  const stopRecording = async (): Promise<string> => {
    activeRef.current = false;
    setIsRecording(false);

    if (chunkTimerRef.current) {
      clearTimeout(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }

    const recording = recordingRef.current;
    recordingRef.current = null;

    if (!recording) {
      const result = accumulatedRef.current;
      setPartialTranscript('');
      return result;
    }

    await recording.stopAndUnloadAsync();
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    const uri = recording.getURI();

    if (!uri) {
      const result = accumulatedRef.current;
      setPartialTranscript('');
      return result;
    }

    setIsTranscribing(true);
    try {
      const text = await transcribeUri(uri);
      const full = text
        ? (accumulatedRef.current ? `${accumulatedRef.current} ${text}` : text)
        : accumulatedRef.current;
      return full;
    } finally {
      setIsTranscribing(false);
      setPartialTranscript('');
    }
  };

  return { startRecording, stopRecording, isRecording, isTranscribing, isAvailable, partialTranscript };
}
