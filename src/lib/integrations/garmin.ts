/**
 * Garmin integration boundary.
 *
 * Status (checked October 2026): Garmin's Connect Developer Program accepts
 * business applicants only and new applications are currently paused. There is
 * therefore NO live Garmin connection in this app. This module defines the
 * contract a real integration must satisfy so it can be added without touching
 * the UI, and reports an honest status.
 *
 * When access is granted (see docs/GARMIN.md):
 *  1. Set GARMIN_CLIENT_ID / GARMIN_CLIENT_SECRET / GARMIN_REDIRECT_URI.
 *  2. Implement the OAuth 2.0 PKCE authorize + callback routes (server only).
 *  3. Store tokens server-side (Supabase table `integration_tokens`, RLS-locked,
 *     never sent to the browser).
 *  4. Receive Health API push/ping notifications on a webhook route, map each
 *     summary with a `HealthProviderMapper`, and upsert by `externalId`
 *     (the unique indexes prevent duplicates).
 */

import type { DailyMetric, SleepRecord, Workout } from "../types";

export type ConnectionState = "not_available" | "not_configured" | "configured_not_connected" | "connected" | "error";

export interface ProviderStatus {
  provider: "garmin";
  state: ConnectionState;
  message: string;
  lastSyncAt?: string;
}

/** What a provider adapter must produce. All records use source "garmin". */
export interface HealthProviderMapper<TRaw> {
  toSleep?(raw: TRaw): Omit<SleepRecord, "id" | "createdAt" | "updatedAt">[];
  toMetrics?(raw: TRaw): Omit<DailyMetric, "id" | "createdAt" | "updatedAt">[];
  toWorkouts?(raw: TRaw): Omit<Workout, "id" | "createdAt" | "updatedAt">[];
}

export function garminServerStatus(env: Record<string, string | undefined> = process.env): ProviderStatus {
  const hasCreds = Boolean(env.GARMIN_CLIENT_ID && env.GARMIN_CLIENT_SECRET);
  if (!hasCreds) {
    return {
      provider: "garmin",
      state: "not_configured",
      message:
        "Not connected. Garmin API access requires approval through the Garmin Connect Developer Program (business applicants; new applications currently paused). Use manual entry or CSV import meanwhile.",
    };
  }
  return {
    provider: "garmin",
    state: "configured_not_connected",
    message:
      "Credentials are present, but the OAuth and sync flow has not been implemented or tested yet. No data is being synced.",
  };
}
