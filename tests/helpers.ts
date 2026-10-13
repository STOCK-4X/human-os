import { defaultProfile } from "@/lib/db";
import type { DataSet } from "@/lib/reports";
import type { Profile } from "@/lib/types";

export const TZ = "Europe/Berlin";

export function profile(patch: Partial<Profile> = {}): Profile {
  return { ...defaultProfile(), timeZone: TZ, createdAt: "2026-01-01T00:00:00Z", ...patch };
}

export function emptyData(patch: Partial<DataSet> = {}): DataSet {
  return {
    profile: profile(),
    metrics: [],
    sleep: [],
    workouts: [],
    habits: [],
    habitLogs: [],
    checkins: [],
    lifestyle: [],
    ...patch,
  };
}

export const ts = "2026-01-01T00:00:00Z";
