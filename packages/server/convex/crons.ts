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
  { minutes: 15 },
  internal.finance.rollupJobs.rebuildStep,
);

export default crons;
