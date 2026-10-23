import { Segmented } from '@/components/finance/ui';
import { RANGE_KEYS, type RangeKey } from '../../../server/convex/finance/series';

export function RangePills({
  value,
  onChange,
  stretch,
}: {
  value: RangeKey | null;
  onChange: (range: RangeKey) => void;
  stretch?: boolean;
}) {
  return (
    <Segmented options={RANGE_KEYS} value={value} onChange={onChange} stretch={stretch} accessibilityLabel="Chart range" />
  );
}
