import { describe, expect, it } from "vitest";
import { resolveTheme } from "@/lib/theme";
import { profile } from "./helpers";

describe("auto day/night theme", () => {
  // Berlin, wake 06:30, need 7h30, latency 15, wind-down 45 → wind-down starts 22:00.
  const p = profile({ theme: "schedule", targetWake: "06:30", sleepNeedMin: 450, sleepLatencyMin: 15, windDownMin: 45 });
  const at = (hhmm: string) => new Date(`2026-10-14T${hhmm}:00+02:00`);
  it("is light during the day and dark from wind-down until wake-up", () => {
    expect(resolveTheme(p, at("12:00"))).toBe("light");
    expect(resolveTheme(p, at("21:59"))).toBe("light");
    expect(resolveTheme(p, at("22:00"))).toBe("dark");
    expect(resolveTheme(p, at("03:00"))).toBe("dark");
    expect(resolveTheme(p, at("06:30"))).toBe("light");
  });
  it("respects explicit choices", () => {
    expect(resolveTheme({ ...p, theme: "dark" }, at("12:00"))).toBe("dark");
    expect(resolveTheme({ ...p, theme: "system" }, at("12:00"))).toBeUndefined();
  });
});
