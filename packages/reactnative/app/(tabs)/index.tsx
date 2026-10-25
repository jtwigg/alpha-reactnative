import { useAuth, useClerk, useUser } from '@clerk/expo';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppBuildLabel } from '@/components/app-build-label';
import { QuickAsk } from '@/components/chat/quick-ask';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { api } from '@/lib/api';
import { isClerkConfigured } from '@/lib/convex';

export default function HomeScreen() {
  if (!isClerkConfigured()) {
    return (
      <ThemedView style={styles.flex}>
        <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <ThemedText type="title">Home</ThemedText>
            </View>
          </View>
          <View style={styles.flex} />
          <AppBuildLabel />
        </SafeAreaView>
      </ThemedView>
    );
  }
  return <SignedInHome />;
}

function SignedInHome() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { isSignedIn } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.current, isAuthenticated ? {} : 'skip');
  const greeting = me ? `Hello, ${me.name}!` : undefined;
  const notes = useQuery(api.messages.list, isAuthenticated ? {} : 'skip');
  const sendNote = useMutation(api.messages.send);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast((current) => (current === message ? null : current)), 3200);
  };

  const handleSave = async () => {
    const text = draft.trim();
    if (!text) return;
    setSaving(true);
    setError(null);
    try {
      await sendNote({ text });
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save note');
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <ThemedText type="title">{greeting ?? 'Home'}</ThemedText>
            <ThemedText style={styles.muted}>
              {user?.primaryEmailAddress?.emailAddress ?? user?.fullName ?? 'Signed in'}
            </ThemedText>
          </View>
          {isSignedIn ? (
            <Pressable style={styles.signOut} onPress={handleSignOut}>
              <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
          ) : null}
        </View>

        <QuickAsk ready={isAuthenticated} onToast={showToast} />
        {toast ? <Text style={styles.toast}>{toast}</Text> : null}

        <ThemedText style={styles.sectionTitle}>Private notes</ThemedText>
        <ThemedText style={styles.muted}>
          These Convex documents are scoped to your user. Other accounts cannot read them.
        </ThemedText>

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Write a note…"
            placeholderTextColor="#888"
            editable={!saving}
          />
          <Pressable
            style={[styles.save, (!draft.trim() || saving) && styles.disabled]}
            onPress={handleSave}
            disabled={!draft.trim() || saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.saveText}>Save</Text>
            )}
          </Pressable>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <FlatList
          data={notes}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            notes === undefined ? (
              <ActivityIndicator style={styles.empty} />
            ) : (
              <Text style={styles.empty}>No notes yet. Add one above.</Text>
            )
          }
          renderItem={({ item }) => (
            <View style={styles.note}>
              <Text style={styles.noteText}>{item.text}</Text>
            </View>
          )}
        />
        <AppBuildLabel />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerText: { flex: 1, gap: 6 },
  muted: { opacity: 0.7, marginHorizontal: 20, marginBottom: 12 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 4,
  },
  signOut: {
    borderWidth: 1,
    borderColor: '#0a7ea4',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  signOutText: { color: '#0a7ea4', fontWeight: '600' },
  composer: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#f7f7f7',
  },
  save: {
    backgroundColor: '#0a7ea4',
    borderRadius: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  saveText: { color: '#fff', fontWeight: '600' },
  disabled: { opacity: 0.4 },
  error: { color: '#b42318', marginHorizontal: 20, marginBottom: 8 },
  toast: {
    marginHorizontal: 20,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#11181C',
    color: '#fff',
    overflow: 'hidden',
    textAlign: 'center',
    fontWeight: '600',
  },
  list: { paddingHorizontal: 20, paddingBottom: 24, gap: 8 },
  note: {
    backgroundColor: '#f3f3f3',
    borderRadius: 12,
    padding: 12,
  },
  noteText: { fontSize: 16, color: '#11181C' },
  empty: { textAlign: 'center', color: '#888', marginTop: 32 },
});
