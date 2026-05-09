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

type Props = {
  onSend: (text: string) => void;
  isLoading: boolean;
};

export function ChatInput({ onSend, isLoading }: Props) {
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
        setText(prev => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
      }
    } else {
      await startRecording();
    }
  };

  const busy = isLoading || isTranscribing;

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder={isRecording ? 'Listening...' : 'Message...'}
        placeholderTextColor="#999"
        multiline
        maxLength={4000}
        editable={!isRecording}
        onSubmitEditing={handleSend}
      />
      {micAvailable && (
        <Pressable
          style={[styles.iconButton, isRecording && styles.iconButtonActive]}
          onPress={handleMic}
          disabled={busy}
        >
          {isTranscribing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name={isRecording ? 'stop' : 'mic'} size={20} color="#fff" />
          )}
        </Pressable>
      )}
      <Pressable
        style={[styles.iconButton, styles.sendButton, (!text.trim() || busy) && styles.disabled]}
        onPress={handleSend}
        disabled={!text.trim() || busy}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Ionicons name="send" size={18} color="#fff" />
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
    borderTopColor: '#ddd',
    backgroundColor: '#fff',
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#666',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonActive: {
    backgroundColor: '#e53935',
  },
  sendButton: {
    backgroundColor: '#0a7ea4',
  },
  disabled: {
    opacity: 0.4,
  },
});
