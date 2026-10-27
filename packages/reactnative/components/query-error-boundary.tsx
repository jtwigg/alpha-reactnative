import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { VersionLabel } from '@/components/home-update-chrome';
import { LIGHT } from '@/lib/app-theme';
import { Sentry } from '@/lib/sentry';

type Props = {
  children: ReactNode;
  compact?: boolean;
  showVersion?: boolean;
  surface?: string;
  fallback?: ReactNode;
};

type State = { error: Error | null };

export function BackendUnavailable({
  onRetry,
  compact,
}: {
  onRetry: () => void;
  compact?: boolean;
}) {
  return (
    <View
      style={compact ? styles.compact : styles.page}
      accessibilityRole="alert"
      accessibilityLabel="Backend unavailable">
      <Text style={compact ? styles.compactTitle : styles.title}>Backend unavailable</Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Retry"
        hitSlop={8}
        style={styles.retry}>
        <Text style={styles.retryText}>Retry</Text>
      </Pressable>
    </View>
  );
}

/** Catches Convex useQuery re-throws (and any other render error) so a dead backend cannot take down the app. */
export class QueryErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    try {
      Sentry.captureException(error, {
        tags: { surface: this.props.surface ?? 'query-boundary' },
        extra: { componentStack: info.componentStack ? '[redacted]' : undefined },
      });
    } catch {
      /* telemetry must never crash the fallback */
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) {
      return this.props.fallback;
    }
    return (
      <View style={this.props.compact ? undefined : styles.page}>
        {this.props.showVersion ? <VersionLabel /> : null}
        <BackendUnavailable
          compact={this.props.compact}
          onRetry={() => this.setState({ error: null })}
        />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: LIGHT.page },
  compact: {
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: LIGHT.negativeSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: LIGHT.negative,
    gap: 8,
  },
  title: { fontSize: 18, fontWeight: '700', color: LIGHT.text, textAlign: 'center' },
  compactTitle: { fontSize: 15, fontWeight: '700', color: LIGHT.negative },
  retry: { alignSelf: 'flex-start' },
  retryText: { fontSize: 15, fontWeight: '600', color: LIGHT.accent },
});
