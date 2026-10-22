import { useAuth } from '@clerk/expo';
import { Audio } from 'expo-av';
import { useState } from 'react';

import { getConvexAccessToken } from '@/lib/convex';
import { transcribeAudio } from '@/lib/transcribe';

export function useWhisper() {
  const { getToken, sessionClaims } = useAuth();
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

    const { recording: nextRecording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY,
    );
    setRecording(nextRecording);
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
      const token = await getConvexAccessToken(getToken, sessionClaims);
      return await transcribeAudio(
        { uri, type: 'audio/m4a', name: 'recording.m4a' },
        token,
      );
    } finally {
      setIsTranscribing(false);
    }
  };

  return { startRecording, stopRecording, isRecording, isTranscribing, isAvailable: true };
}
