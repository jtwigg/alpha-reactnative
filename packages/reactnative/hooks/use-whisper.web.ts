import { useRef, useState } from 'react';

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? '';

export function useWhisper() {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const resolveRef = useRef<((text: string) => void) | null>(null);
  const accumulatedRef = useRef('');
  const pendingItemsRef = useRef(new Set<string>());
  const stoppedRef = useRef(false);

  const isAvailable =
    typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  const tryResolve = () => {
    if (stoppedRef.current && pendingItemsRef.current.size === 0 && resolveRef.current) {
      resolveRef.current(accumulatedRef.current);
      resolveRef.current = null;
    }
  };

  const startRecording = async () => {
    accumulatedRef.current = '';
    pendingItemsRef.current = new Set();
    stoppedRef.current = false;
    setPartialTranscript('');

    const ws = new WebSocket(
      'wss://api.openai.com/v1/realtime?intent=transcription',
      ['realtime', `openai-insecure-api-key.${OPENAI_API_KEY}`, 'openai-beta.realtime-v1'],
    );
    wsRef.current = ws;

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: 'session.update',
          session: {
            input_audio_format: 'pcm16',
            input_audio_transcription: { model: 'gpt-4o-transcribe' },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500,
            },
          },
        }));
        resolve();
      };
      ws.onerror = () => reject(new Error('Realtime WebSocket error'));
    });

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data as string);

      if (msg.type === 'conversation.item.created' && msg.item?.id) {
        pendingItemsRef.current.add(msg.item.id as string);
      } else if (msg.type === 'conversation.item.input_audio_transcription.delta') {
        accumulatedRef.current += msg.delta ?? '';
        setPartialTranscript(accumulatedRef.current);
      } else if (msg.type === 'conversation.item.input_audio_transcription.completed') {
        pendingItemsRef.current.delete(msg.item_id as string);
        tryResolve();
      }
    };

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    const audioContext = new AudioContext({ sampleRate: 24000 });
    audioContextRef.current = audioContext;

    const source = audioContext.createMediaStreamSource(stream);
    // ScriptProcessorNode is deprecated but widely supported
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const float32 = e.inputBuffer.getChannelData(0);
      ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: float32ToBase64Pcm16(float32) }));
    };

    source.connect(processor);
    processor.connect(audioContext.destination);

    setIsRecording(true);
  };

  const stopRecording = async (): Promise<string> => {
    setIsRecording(false);
    stoppedRef.current = true;

    processorRef.current?.disconnect();
    processorRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setPartialTranscript('');
      return accumulatedRef.current;
    }

    setIsTranscribing(true);

    return new Promise<string>((resolve) => {
      const finish = (text: string) => {
        setIsTranscribing(false);
        setPartialTranscript('');
        wsRef.current?.close();
        wsRef.current = null;
        resolve(text);
      };

      resolveRef.current = finish;

      ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));

      // If commit had no audio (e.g. stopped during silence), no new item fires — resolve shortly
      setTimeout(() => {
        if (pendingItemsRef.current.size === 0 && resolveRef.current) {
          resolveRef.current(accumulatedRef.current);
          resolveRef.current = null;
        }
      }, 300);

      // Hard fallback in case completed events don't fire
      setTimeout(() => {
        if (resolveRef.current) {
          resolveRef.current(accumulatedRef.current);
          resolveRef.current = null;
        }
      }, 5000);
    });
  };

  return { startRecording, stopRecording, isRecording, isTranscribing, isAvailable, partialTranscript };
}

function float32ToBase64Pcm16(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
