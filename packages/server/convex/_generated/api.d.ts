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
import type * as allowlist from "../allowlist.js";
import type * as app_release from "../app/release.js";
import type * as briefings_feedback from "../briefings/feedback.js";
import type * as briefings_gateway from "../briefings/gateway.js";
import type * as briefings_ingest from "../briefings/ingest.js";
import type * as briefings_payload from "../briefings/payload.js";
import type * as briefings_queries from "../briefings/queries.js";
import type * as briefings_receivedAt from "../briefings/receivedAt.js";
import type * as briefings_validators from "../briefings/validators.js";
import type * as chat from "../chat.js";
import type * as crons from "../crons.js";
import type * as finance_accountModel from "../finance/accountModel.js";
import type * as finance_accounts from "../finance/accounts.js";
import type * as finance_auth from "../finance/auth.js";
import type * as finance_benchmarks from "../finance/benchmarks.js";
import type * as finance_dates from "../finance/dates.js";
import type * as finance_delete from "../finance/delete.js";
import type * as finance_gateway from "../finance/gateway.js";
import type * as finance_hash from "../finance/hash.js";
import type * as finance_ingest from "../finance/ingest.js";
import type * as finance_lib from "../finance/lib.js";
import type * as finance_market from "../finance/market.js";
import type * as finance_pending from "../finance/pending.js";
import type * as finance_queries from "../finance/queries.js";
import type * as finance_rollupJobs from "../finance/rollupJobs.js";
import type * as finance_rollups from "../finance/rollups.js";
import type * as finance_scan from "../finance/scan.js";
import type * as finance_secret from "../finance/secret.js";
import type * as finance_series from "../finance/series.js";
import type * as finance_seriesModel from "../finance/seriesModel.js";
import type * as finance_serve from "../finance/serve.js";
import type * as finance_serveJobs from "../finance/serveJobs.js";
import type * as finance_sync from "../finance/sync.js";
import type * as finance_twrModel from "../finance/twrModel.js";
import type * as finance_validators from "../finance/validators.js";
import type * as http from "../http.js";
import type * as messages from "../messages.js";
import type * as plaid_client from "../plaid/client.js";
import type * as plaid_crypto from "../plaid/crypto.js";
import type * as plaid_link from "../plaid/link.js";
import type * as plaid_model from "../plaid/model.js";
import type * as plaid_runs from "../plaid/runs.js";
import type * as plaid_store from "../plaid/store.js";
import type * as plaid_sync from "../plaid/sync.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  allowlist: typeof allowlist;
  "app/release": typeof app_release;
  "briefings/feedback": typeof briefings_feedback;
  "briefings/gateway": typeof briefings_gateway;
  "briefings/ingest": typeof briefings_ingest;
  "briefings/payload": typeof briefings_payload;
  "briefings/queries": typeof briefings_queries;
  "briefings/receivedAt": typeof briefings_receivedAt;
  "briefings/validators": typeof briefings_validators;
  chat: typeof chat;
  crons: typeof crons;
  "finance/accountModel": typeof finance_accountModel;
  "finance/accounts": typeof finance_accounts;
  "finance/auth": typeof finance_auth;
  "finance/benchmarks": typeof finance_benchmarks;
  "finance/dates": typeof finance_dates;
  "finance/delete": typeof finance_delete;
  "finance/gateway": typeof finance_gateway;
  "finance/hash": typeof finance_hash;
  "finance/ingest": typeof finance_ingest;
  "finance/lib": typeof finance_lib;
  "finance/market": typeof finance_market;
  "finance/pending": typeof finance_pending;
  "finance/queries": typeof finance_queries;
  "finance/rollupJobs": typeof finance_rollupJobs;
  "finance/rollups": typeof finance_rollups;
  "finance/scan": typeof finance_scan;
  "finance/secret": typeof finance_secret;
  "finance/series": typeof finance_series;
  "finance/seriesModel": typeof finance_seriesModel;
  "finance/serve": typeof finance_serve;
  "finance/serveJobs": typeof finance_serveJobs;
  "finance/sync": typeof finance_sync;
  "finance/twrModel": typeof finance_twrModel;
  "finance/validators": typeof finance_validators;
  http: typeof http;
  messages: typeof messages;
  "plaid/client": typeof plaid_client;
  "plaid/crypto": typeof plaid_crypto;
  "plaid/link": typeof plaid_link;
  "plaid/model": typeof plaid_model;
  "plaid/runs": typeof plaid_runs;
  "plaid/store": typeof plaid_store;
  "plaid/sync": typeof plaid_sync;
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
