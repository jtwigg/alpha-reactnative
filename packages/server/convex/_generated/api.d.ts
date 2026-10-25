/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access from "../access.js";
import type * as briefings_feedback from "../briefings/feedback.js";
import type * as briefings_gateway from "../briefings/gateway.js";
import type * as briefings_ingest from "../briefings/ingest.js";
import type * as briefings_queries from "../briefings/queries.js";
import type * as chat from "../chat.js";
import type * as crons from "../crons.js";
import type * as finance_accounts from "../finance/accounts.js";
import type * as finance_gateway from "../finance/gateway.js";
import type * as finance_ingest from "../finance/ingest.js";
import type * as finance_market from "../finance/market.js";
import type * as finance_queries from "../finance/queries.js";
import type * as finance_rollupJobs from "../finance/rollupJobs.js";
import type * as finance_serveJobs from "../finance/serveJobs.js";
import type * as finance_sync from "../finance/sync.js";
import type * as http from "../http.js";
import type * as messages from "../messages.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  "briefings/feedback": typeof briefings_feedback;
  "briefings/gateway": typeof briefings_gateway;
  "briefings/ingest": typeof briefings_ingest;
  "briefings/queries": typeof briefings_queries;
  chat: typeof chat;
  crons: typeof crons;
  "finance/accounts": typeof finance_accounts;
  "finance/gateway": typeof finance_gateway;
  "finance/ingest": typeof finance_ingest;
  "finance/market": typeof finance_market;
  "finance/queries": typeof finance_queries;
  "finance/rollupJobs": typeof finance_rollupJobs;
  "finance/serveJobs": typeof finance_serveJobs;
  "finance/sync": typeof finance_sync;
  http: typeof http;
  messages: typeof messages;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
