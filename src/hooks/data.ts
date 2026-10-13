"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState, useSyncExternalStore } from "react";
import { getProfile } from "@/lib/db";
import { todayKey } from "@/lib/date";
import { loadDataSet } from "@/lib/store";

/** Whole local dataset, re-rendering on any change. `undefined` while loading. */
export function useDataSet() {
  return useLiveQuery(() => loadDataSet(), []);
}

export function useProfile() {
  return useLiveQuery(() => getProfile(), []);
}

/** Current time, refreshed every 30 s so the day rolls over correctly. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    const onVis = () => document.visibilityState === "visible" && setNow(new Date());
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [intervalMs]);
  return now;
}

export function useToday(tz: string | undefined) {
  const now = useNow();
  return tz ? todayKey(tz, now) : undefined;
}

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}
