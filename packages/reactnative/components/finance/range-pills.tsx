import { Segmented } from '@/components/finance/ui';
import type { RangeKey } from '../../../server/convex/finance/series';

const RANGES: readonly RangeKey[] = ['1M', '3M', 'YTD', '1Y', 'All'];

export function RangePills({
  value,
  onChange,
}: {
  value: RangeKey;
  onChange: (range: RangeKey) => void;
}) {
  return <Segmented options={RANGES} value={value} onChange={onChange} accessibilityLabel="Chart range" />;
}
