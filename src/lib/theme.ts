import { clockOf, clockToMin } from "./date";
import { planSleep } from "./sleep";
import type { Profile } from "./types";

export const THEME_KEY = "hos-theme";

/** The concrete theme to apply now, or undefined to follow the OS. */
export function resolveTheme(p: Pick<Profile, "theme" | "timeZone" | "targetWake" | "sleepNeedMin" | "sleepLatencyMin" | "windDownMin">, now = new Date()): "light" | "dark" | undefined {
  if (p.theme === "light" || p.theme === "dark") return p.theme;
  if (p.theme === "system") return undefined;
  const t = clockToMin(clockOf(now, p.timeZone));
  const dark = clockToMin(planSleep(p.targetWake, p.sleepNeedMin, p.sleepLatencyMin, p.windDownMin).windDownStart);
  const light = clockToMin(p.targetWake);
  const isDark = dark > light ? t >= dark || t < light : t >= dark && t < light;
  return isDark ? "dark" : "light";
}

/** Inline script that applies the last resolved theme before first paint (no flash). */
export const themeBootScript = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
