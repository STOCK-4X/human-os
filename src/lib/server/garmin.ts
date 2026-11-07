import { emptyGarmin, mapActivities, mapDailySummaries, mapHrv, mapSleepSummaries, type GarminRecords } from "../garmin-map";

/**
 * Garmin Connect Personal API client (server only).
 * The personal API key lives in GARMIN_PERSONAL_API_KEY on the server and never
 * reaches the browser. It is exchanged for a 24-hour bearer token, cached in
 * memory and refreshed an hour before expiry.
 * Docs: https://developer.garmin.com/gc-developer-program/personal/personal-api/
 */

const BASE = "https://personal.connectapi.garmin.com";
const TOKEN_PATH = "/personalapitoken-service/personal-api/personal-api-key/token";
const TIMEOUT_MS = 20_000;

export class GarminError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export const garminKeyConfigured = (env = process.env) => Boolean(env.GARMIN_PERSONAL_API_KEY?.trim());

let cached: { token: string; expiresAt: number } | undefined;

function jwtExp(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return Number(payload.exp) * 1000;
  } catch {
    return Date.now() + 60 * 60_000;
  }
}

export async function garminToken(force = false): Promise<string> {
  if (!force && cached && cached.expiresAt - Date.now() > 60 * 60_000) return cached.token;
  const key = process.env.GARMIN_PERSONAL_API_KEY?.trim();
  if (!key) throw new GarminError("GARMIN_PERSONAL_API_KEY is not set on the server.", 503);
  const res = await fetch(BASE + TOKEN_PATH, {
    method: "POST",
    headers: { Accept: "*/*", Authorization: `ApiKey ${key}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 401 || res.status === 403 || res.status === 404)
    throw new GarminError("Garmin says this Personal API key no longer exists or has expired. Create a new key in Garmin Connect and update GARMIN_PERSONAL_API_KEY.", 424);
  if (!res.ok) throw new GarminError(`Garmin token request failed (${res.status}).`, 502);
  const token = (await res.text()).trim();
  cached = { token, expiresAt: jwtExp(token) };
  return token;
}

async function get(path: string, retry = true): Promise<unknown> {
  const token = await garminToken();
  const res = await fetch(BASE + path, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 401 && retry) {
    cached = undefined;
    return get(path, false);
  }
  if (res.status === 429) throw new GarminError("Garmin rate limit reached — try again later.", 429);
  if (!res.ok) throw new GarminError(`Garmin ${path.split("?")[0]} failed (${res.status}).`, 502);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/** Proves the key works end-to-end with one tiny data call (not just a cached token). */
export async function garminPing(): Promise<void> {
  const d = new Date().toISOString().slice(0, 10);
  await get(`/usersummary-service/stats/steps/daily/${d}/${d}`);
}

/** Fetch and map one inclusive date range (keep it ≤ 31 days per call). */
export async function fetchGarminRange(start: string, end: string): Promise<GarminRecords> {
  const out = emptyGarmin();
  const q = `startDate=${start}&endDate=${end}`;
  const [daily, sleep, hrv, acts] = await Promise.all([
    get(`/usersummary-service/v2/dailysummaries?${q}`),
    get(`/sleep-service/sleep/dailySleepSummariesByDate?${q}`),
    get(`/hrv-service/hrv/daily/${start}/${end}`),
    get(`/activitylist-service/activities/search/activities?start=0&limit=100&${q}`),
  ]);
  mapDailySummaries(daily, out);
  mapSleepSummaries(sleep, out);
  mapHrv(hrv, out);
  mapActivities(acts, out);
  return out;
}
