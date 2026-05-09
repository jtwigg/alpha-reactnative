import { useRef, useState } from 'react';

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? '';
const WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions';

export function useWhisper() {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const isAvailable =
    typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    chunksRef.current = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start(100); // flush chunks every 100ms so the start isn't dropped
    setIsRecording(true);
  };

  const stopRecording = async (): Promise<string> => {
    const mediaRecorder = mediaRecorderRef.current;
    if (!mediaRecorder) return '';

    setIsRecording(false);

    const blob = await new Promise<Blob>((resolve) => {
      mediaRecorder.onstop = () => {
        const result = new Blob(chunksRef.current, { type: 'audio/webm' });
        mediaRecorder.stream.getTracks().forEach((t) => t.stop());
        resolve(result);
      };
      mediaRecorder.stop();
    });

    mediaRecorderRef.current = null;
    chunksRef.current = [];

    debugDownload(blob);

    setIsTranscribing(true);
    try {
      return await transcribe(blob);
    } finally {
      setIsTranscribing(false);
    }
  };

  return { startRecording, stopRecording, isRecording, isTranscribing, isAvailable };
}

function debugDownload(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `recording-${Date.now()}.webm`;
  a.click();
  URL.revokeObjectURL(url);
}

async function transcribe(blob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append('file', blob, 'recording.webm');

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
