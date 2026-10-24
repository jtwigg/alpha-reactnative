import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  ARCHIVE_DONE_MS,
  ARCHIVE_SLIDE_MS,
  ARCHIVE_UNDO_MS,
  archiveTranslate,
  shouldCommitArchive,
  swipeLock,
  threadOpenUrl,
  type SwipeLock,
} from '@/lib/briefing-gesture';
import { briefingItemId } from '../../../server/convex/briefings/payload';
import type { GlanceItem, PriorityItem } from '../../../server/convex/briefings/payload';

const ORANGE = '#c2410c';
const MUTED = '#6b7280';
const BORDER = '#e5e7eb';
const TEXT = '#1f2430';
const SOFT = '#fff7ed';
const DEADLINE = '#92400e';

export type FeedbackArgs = {
  deck: string;
  date: string;
  title: string;
  sender: string;
  threadUrl: string;
  threadId: string;
  account: 'personal' | 'crankcase';
  reaction: 'remember' | 'stop' | 'archive' | null;
  comment: string;
};

type SendFeedback = (args: FeedbackArgs) => Promise<{ ok: boolean; error?: string; upstream?: number }>;

export function BriefingCard({
  item,
  date,
  account,
  deckName,
  compact,
  send,
}: {
  item: PriorityItem | GlanceItem;
  date: string;
  account: 'personal' | 'crankcase';
  deckName: 'Personal' | 'Crankcase';
  compact?: boolean;
  send: SendFeedback;
}) {
  const priority = 'rank' in item ? item : null;
  const [reaction, setReaction] = useState<'remember' | 'stop' | null>(null);
  const [status, setStatus] = useState('');
  const [commentOpen, setCommentOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [phase, setPhase] = useState<'card' | 'undo' | 'done' | 'gone'>('card');
  const translate = useRef(new Animated.Value(0)).current;
  const lock = useRef<SwipeLock>('none');
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
      if (goneTimer.current) clearTimeout(goneTimer.current);
    },
    [],
  );

  const payload = (next: 'remember' | 'stop' | 'archive' | null, text: string): FeedbackArgs => ({
    deck: deckName,
    date,
    title: item.gist.slice(0, 300),
    sender: item.sender.slice(0, 200),
    threadUrl: item.webUrl,
    threadId: item.threadId,
    account,
    reaction: next,
    comment: text,
  });

  const post = async (next: 'remember' | 'stop' | 'archive' | null, text: string) => {
    setStatus('Sending…');
    try {
      const result = await send(payload(next, text));
      if (result.ok) {
        setStatus('Sent ✓');
        return true;
      }
      setStatus(result.upstream ? `Failed (${result.upstream})` : result.error === 'forward failed' ? 'Failed – offline?' : 'Failed');
      return false;
    } catch {
      setStatus('Failed – offline?');
      return false;
    }
  };

  const pick = (next: 'remember' | 'stop') => {
    if (Platform.OS === 'ios') void Haptics.selectionAsync().catch(() => undefined);
    setReaction(next);
    void post(next, '');
  };

  const sendComment = async () => {
    const text = comment.trim().slice(0, 1000);
    if (!text) return;
    const ok = await post(reaction, text);
    if (ok) {
      setComment('');
      setCommentOpen(false);
    }
  };

  const commitArchive = () => {
    if (Platform.OS === 'ios') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    Animated.timing(translate, { toValue: -400, duration: ARCHIVE_SLIDE_MS, useNativeDriver: true }).start(() => {
      setPhase('undo');
      undoTimer.current = setTimeout(() => {
        void (async () => {
          const ok = await post('archive', '');
          setStatus(ok ? 'Archive requested ✓' : 'Failed');
          setPhase('done');
          goneTimer.current = setTimeout(() => setPhase('gone'), ARCHIVE_DONE_MS);
        })();
      }, ARCHIVE_UNDO_MS);
    });
  };

  const undo = () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    translate.setValue(0);
    setPhase('card');
    setStatus('');
  };

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) => {
        lock.current = swipeLock(gesture.dx, gesture.dy);
        return lock.current === 'horizontal';
      },
      onPanResponderMove: (_event, gesture) => {
        if (lock.current === 'none') lock.current = swipeLock(gesture.dx, gesture.dy);
        translate.setValue(archiveTranslate(gesture.dx, lock.current));
      },
      onPanResponderRelease: (_event, gesture) => {
        if (shouldCommitArchive(gesture.dx, lock.current)) {
          commitArchive();
        } else {
          Animated.spring(translate, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
        }
        lock.current = 'none';
      },
      onPanResponderTerminate: () => {
        Animated.spring(translate, { toValue: 0, useNativeDriver: true }).start();
        lock.current = 'none';
      },
    }),
  ).current;

  if (phase === 'gone') return null;
  if (phase === 'undo' || phase === 'done') {
    return (
      <View style={styles.undo} accessibilityRole="alert">
        <Text style={styles.undoText}>
          {phase === 'done' ? status || 'Archived · ' + item.sender : `Archived · ${item.sender}`}
        </Text>
        {phase === 'undo' ? (
          <Pressable onPress={undo} accessibilityRole="button" accessibilityLabel="Undo archive" style={styles.undoBtn}>
            <Text style={styles.undoBtnText}>Undo</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const open = () => {
    const url = threadOpenUrl(item.webUrl, item.mobileUrl, Platform.OS);
    void Linking.openURL(url).catch(() => undefined);
  };

  return (
    <Animated.View
      style={[styles.card, { transform: [{ translateX: translate }] }]}
      {...pan.panHandlers}
      accessibilityLabel={`Briefing item ${briefingItemId(date, account, item.threadId)}`}
    >
      {priority ? (
        <View style={styles.meta}>
          <View style={styles.rank}>
            <Text style={styles.rankText}>{priority.rank}</Text>
          </View>
          <Text style={styles.deadline}>{priority.deadline}</Text>
        </View>
      ) : null}
      <Text style={styles.who}>{item.sender}</Text>
      <Text style={styles.gist}>{item.gist}</Text>
      {priority ? (
        <View style={styles.todo}>
          <Text style={styles.todoText}>
            <Text style={styles.todoLead}>Do: </Text>
            {priority.todo}
          </Text>
        </View>
      ) : null}
      {!compact ? (
        <Pressable onPress={open} accessibilityRole="link" accessibilityLabel="Open thread" style={styles.open}>
          <Text style={styles.openText}>Open thread ↗</Text>
        </Pressable>
      ) : (
        <Pressable onPress={open} accessibilityRole="link" accessibilityLabel="Open thread">
          <Text style={styles.openText}>Open thread ↗</Text>
        </Pressable>
      )}

      <View style={styles.fb}>
        <Pressable
          onPress={() => pick('remember')}
          accessibilityRole="button"
          accessibilityLabel="Remember"
          accessibilityState={{ selected: reaction === 'remember' }}
          style={[styles.btn, reaction === 'remember' && styles.rememberOn]}
        >
          <Text style={styles.btnText}>⭐ Remember</Text>
        </Pressable>
        <Pressable
          onPress={() => pick('stop')}
          accessibilityRole="button"
          accessibilityLabel="Stop"
          accessibilityState={{ selected: reaction === 'stop' }}
          style={[styles.btn, reaction === 'stop' && styles.stopOn]}
        >
          <Text style={styles.btnText}>🛑 Stop</Text>
        </Pressable>
        <Pressable
          onPress={() => setCommentOpen((openState) => !openState)}
          accessibilityRole="button"
          accessibilityLabel="Comment"
          style={styles.btn}
        >
          <Text style={styles.btnText}>Comment</Text>
        </Pressable>
      </View>
      {status ? <Text style={styles.status}>{status}</Text> : null}
      {commentOpen ? (
        <View style={styles.box}>
          <TextInput
            value={comment}
            onChangeText={setComment}
            maxLength={1000}
            multiline
            placeholder="Comment"
            placeholderTextColor={MUTED}
            style={styles.input}
            accessibilityLabel="Comment text"
          />
          <Pressable onPress={() => void sendComment()} accessibilityRole="button" accessibilityLabel="Send comment" style={styles.send}>
            <Text style={styles.sendText}>Send</Text>
          </Pressable>
        </View>
      ) : null}
      <Text style={styles.hint}>Swipe card left to archive</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rank: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  deadline: { color: DEADLINE, fontSize: 13, fontWeight: '600' },
  who: { color: TEXT, fontSize: 15, fontWeight: '700' },
  gist: { color: TEXT, fontSize: 15, lineHeight: 20 },
  todo: { backgroundColor: SOFT, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  todoText: { color: TEXT, fontSize: 14, lineHeight: 19 },
  todoLead: { fontWeight: '700' },
  open: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  openText: { color: ORANGE, fontSize: 14, fontWeight: '600' },
  fb: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  btn: {
    minHeight: 44,
    minWidth: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 10,
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  rememberOn: { backgroundColor: '#fef3c7', borderColor: '#d97706' },
  stopOn: { backgroundColor: '#fee2e2', borderColor: '#dc2626' },
  btnText: { color: TEXT, fontSize: 13, fontWeight: '600' },
  status: { color: MUTED, fontSize: 12 },
  box: { gap: 8 },
  input: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    padding: 10,
    color: TEXT,
    textAlignVertical: 'top',
  },
  send: {
    alignSelf: 'flex-start',
    backgroundColor: '#111',
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  sendText: { color: '#fff', fontWeight: '700' },
  hint: { color: MUTED, fontSize: 11 },
  undo: {
    backgroundColor: '#1f2430',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 56,
  },
  undoText: { color: '#f7f7f4', fontSize: 14, flexShrink: 1 },
  undoBtn: { backgroundColor: '#facc15', borderRadius: 10, minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' },
  undoBtnText: { color: '#1f2430', fontWeight: '800' },
});
