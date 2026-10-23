import { getConvexSiteUrl } from '@/lib/convex';

type NativeAudioFile = { uri: string; type: string; name: string };

export async function transcribeAudio(
  file: Blob | NativeAudioFile,
  token: string | null,
): Promise<string> {
  if (!token) {
    throw new Error('Not authenticated');
  }

  const formData = new FormData();
  if (file instanceof Blob) {
    const filename = 'recording.webm';
    formData.append('file', file, filename);
  } else {
    formData.append('file', file as unknown as Blob);
  }
  formData.append('model', 'whisper-1');

  const response = await fetch(`${getConvexSiteUrl()}/transcribe`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Whisper error: ${body}`);
  }

  const data = JSON.parse(body) as { text?: string; error?: string };
  if (data.error) throw new Error(data.error);
  return data.text ?? '';
}
