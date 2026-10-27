import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useWhisper } from '@/hooks/use-whisper';
import { useAppPalette } from '@/lib/app-theme';

type Props = {
  onSend: (text: string) => void;
  isLoading: boolean;
};

export function ChatInput({ onSend, isLoading }: Props) {
  const palette = useAppPalette();
  const [text, setText] = useState('');
  const { startRecording, stopRecording, isRecording, isTranscribing, isAvailable: micAvailable } = useWhisper();

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };

  const handleMic = async () => {
    if (isRecording) {
      const transcript = await stopRecording();
      if (transcript) {
        setText((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
      }
    } else {
      await startRecording();
    }
  };

  const busy = isLoading || isTranscribing;

  return (
    <View style={[styles.container, { backgroundColor: palette.page, borderTopColor: palette.border }]}>
      <TextInput
        style={[
          styles.input,
          { borderColor: palette.border, backgroundColor: palette.card, color: palette.text },
        ]}
        value={text}
        onChangeText={setText}
        placeholder={isRecording ? 'Listening...' : 'Message...'}
        placeholderTextColor={palette.subtle}
        multiline
        maxLength={4000}
        editable={!isRecording}
        onSubmitEditing={handleSend}
      />
      {micAvailable && (
        <Pressable
          style={[styles.iconButton, { backgroundColor: isRecording ? palette.negative : palette.muted }]}
          onPress={handleMic}
          disabled={busy}
        >
          {isTranscribing ? (
            <ActivityIndicator size="small" color={palette.card} />
          ) : (
            <Ionicons name={isRecording ? 'stop' : 'mic'} size={20} color={palette.card} />
          )}
        </Pressable>
      )}
      <Pressable
        style={[styles.iconButton, { backgroundColor: palette.accent }, (!text.trim() || busy) && styles.disabled]}
        onPress={handleSend}
        disabled={!text.trim() || busy}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={palette.card} />
        ) : (
          <Ionicons name="send" size={18} color={palette.card} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
});
