"use client";

import { WifiOff } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { DEMO_FLAG } from "@/lib/demo";
import { useDataSet, useNow, useOnline, useProfile } from "@/hooks/data";
import { requestPersistence } from "@/lib/db";
import { todayKey } from "@/lib/date";
import { dueReminders, showNotification } from "@/lib/notifications";
import { syncInbox } from "@/lib/inbox-sync";

import { THEME_KEY, resolveTheme } from "@/lib/theme";
import { Celebration } from "./achievements/Celebration";

/** App-wide side effects: service worker, theme, onboarding, reminders, offline banner. */
export function AppRuntime() {
  const profile = useProfile();
  const data = useDataSet();
  const online = useOnline();
  const path = usePathname();
  const router = useRouter();

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch((e) => console.warn("SW registration failed", e));
    }
    void requestPersistence();
  }, []);

  // Apple Health inbox: collect on open, when back online, and every 15 minutes.
  const token = profile?.onboarded ? profile.coachToken : undefined;
  useEffect(() => {
    if (!token || !online) return;
    void syncInbox(token);
    const t = setInterval(() => void syncInbox(token), 15 * 60_000);
    return () => clearInterval(t);
  }, [token, online]);

  const now = useNow(60_000);
  useEffect(() => {
    if (!profile) return;
    const root = document.documentElement;
    const resolved = resolveTheme(profile, now);
    if (resolved) root.setAttribute("data-theme", resolved);
    else root.removeAttribute("data-theme");
    try {
      localStorage.setItem(THEME_KEY, resolved ?? "system");
    } catch {}
  }, [profile, now]);

  useEffect(() => {
    if (profile && !profile.onboarded && !path.startsWith("/onboarding")) router.replace("/onboarding");
  }, [profile, path, router]);

  useEffect(() => {
    if (!data?.profile.notifications.enabled) return;
    const tick = () => {
      const now = new Date();
      const sent = (k: string) => {
        try {
          return localStorage.getItem(`hos-notified:${k}`) !== null;
        } catch {
          return false;
        }
      };
      for (const r of dueReminders(data, now, todayKey(data.profile.timeZone, now), sent)) {
        void showNotification(r).then((ok) => {
          if (ok)
            try {
              localStorage.setItem(`hos-notified:${r.id}`, "1");
            } catch {}
        });
      }
    };
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, [data]);

  const demo = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return localStorage.getItem(DEMO_FLAG) === "1";
      } catch {
        return false;
      }
    },
    () => false,
  );
  const celebration = (
    <>
      {demo && (
        <div className="fixed top-0 left-1/2 z-50 -translate-x-1/2 rounded-b-md bg-warn px-2 pt-[env(safe-area-inset-top)] text-[10px] leading-4 font-semibold tracking-wide whitespace-nowrap text-white">
          DEMO DATA · SYNTHETIC
        </div>
      )}
      {data && data.profile.onboarded && !path.startsWith("/onboarding") ? <Celebration data={data} /> : null}
    </>
  );
  if (online) return celebration;
  return (
    <>
    {celebration}
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-ink py-1.5 pt-[max(env(safe-area-inset-top),0.375rem)] text-xs font-medium text-bg"
    >
      <WifiOff size={14} aria-hidden /> Offline — everything you log is saved on this device. AI coach unavailable.
    </div>
    </>
  );
}
