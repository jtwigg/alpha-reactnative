import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { FText, StateMessage, useFinancePalette } from '@/components/finance/ui';
import { Sentry } from '@/lib/sentry';

type Props = { children: ReactNode; title?: string };
type State = { error: Error | null };

function Fallback({ title, onRetry }: { title: string; onRetry: () => void }) {
  const palette = useFinancePalette();
  return (
    <View style={[styles.wrap, { backgroundColor: palette.page }]}>
      <StateMessage
        title={title}
        body="Something went wrong loading this screen. Your data is still on the server — try again."
        action={
          <Pressable onPress={onRetry} hitSlop={8} accessibilityRole="button">
            <FText tone="accent" variant="callout">
              Try again
            </FText>
          </Pressable>
        }
      />
    </View>
  );
}

/** Keeps a Finances render error from taking down the rest of the app. */
export class FinanceErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    Sentry.captureException(error, {
      tags: { surface: 'finances-boundary' },
      extra: { componentStack: info.componentStack ? '[redacted]' : undefined },
    });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Fallback
        title={this.props.title ?? 'Personal finances'}
        onRetry={() => this.setState({ error: null })}
      />
    );
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
