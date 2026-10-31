import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

crons.daily(
  'refresh market index cache',
  { hourUTC: 13, minuteUTC: 15 },
  internal.finance.market.refreshAll,
);

crons.interval(
  'drain finance rollup rebuild',
  { hours: 1 },
  internal.finance.rollupJobs.rebuildStep,
);

// 11:30 UTC is 4:30 AM PT in daylight time and 3:30 AM PT otherwise. A no-op
// unless PLAID_SYNC_ENABLED=true; shadow items fetch and report without writing.
crons.daily(
  'plaid daily sync',
  { hourUTC: 11, minuteUTC: 30 },
  internal.plaid.sync.dailySync,
);

export default crons;
