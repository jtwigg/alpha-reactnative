import { Redirect, useLocalSearchParams, type Href } from 'expo-router';

import { LinkNotFound } from '@/components/link-not-found';
import { accountPath, parseAccountId, parseRange } from '@/lib/app-links';
import { useFinanceDemo } from '@/lib/finance-demo';

export default function LegacyAccountRedirect() {
  const params = useLocalSearchParams<{ id?: string; range?: string }>();
  const sourceId = parseAccountId(params.id);
  const demo = useFinanceDemo();
  if (!sourceId) {
    return (
      <LinkNotFound
        title="Account not found"
        body="That account id is not a link Alpha recognizes."
        href="/finances"
        label="Back to Finances"
      />
    );
  }
  return <Redirect href={accountPath(sourceId, { range: parseRange(params.range), demo }) as Href} />;
}
