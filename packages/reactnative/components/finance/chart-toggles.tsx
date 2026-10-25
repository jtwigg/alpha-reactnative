import { StyleSheet, View } from 'react-native';

import { TogglePill, useFinancePalette } from '@/components/finance/ui';
import { useChartColors } from '@/lib/finance-colors';
import { BENCHMARKS } from '../../../server/convex/finance/benchmarks';

export function ChartToggles({
  timeWeighted,
  onTimeWeighted,
  showSp500,
  onShowSp500,
  showTimeWeighted = true,
  showSp500Toggle = true,
}: {
  timeWeighted: boolean;
  onTimeWeighted: (value: boolean) => void;
  showSp500: boolean;
  onShowSp500: (value: boolean) => void;
  showTimeWeighted?: boolean;
  showSp500Toggle?: boolean;
}) {
  const palette = useFinancePalette();
  const colors = useChartColors();
  if (!showTimeWeighted && !showSp500Toggle) return null;
  return (
    <View style={styles.row}>
      {showTimeWeighted ? (
        <TogglePill
          label="Time-weighted"
          value={timeWeighted}
          onChange={onTimeWeighted}
          color={palette.accent}
        />
      ) : null}
      {showSp500Toggle ? (
        <TogglePill
          label={BENCHMARKS.SPX.label}
          value={showSp500}
          onChange={onShowSp500}
          color={colors.benchmark}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
});
