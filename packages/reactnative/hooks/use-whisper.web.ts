import { useAuth } from '@clerk/expo';
import { useRef, useState } from 'react';

import { getConvexAccessToken } from '@/lib/convex';
import { transcribeAudio } from '@/lib/transcribe';

export function useWhisper() {
  const { getToken, sessionClaims } = useAuth();
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
    mediaRecorder.start(100);
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

    setIsTranscribing(true);
    try {
      const token = await getConvexAccessToken(getToken, sessionClaims);
      return await transcribeAudio(blob, token);
    } finally {
      setIsTranscribing(false);
    }
  };

  return { startRecording, stopRecording, isRecording, isTranscribing, isAvailable };
}
