import type { CoachPayload } from "./coach";

export type CoachResult = { ok: true; content: string; model: string } | { ok: false; error: string; message: string };

export async function askCoach(payload: CoachPayload, token?: string): Promise<CoachResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return { ok: false, error: "offline", message: "You're offline. The AI coach needs a connection." };
  try {
    const res = await fetch("/api/coach", {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { "x-coach-token": token } : {}) },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json.error ?? "http", message: json.message ?? `Request failed (${res.status}).` };
    return { ok: true, content: json.content, model: json.model };
  } catch {
    return { ok: false, error: "network", message: "Couldn't reach the server." };
  }
}
