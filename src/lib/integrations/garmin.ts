/**
 * Garmin integration status.
 *
 * Human OS uses Garmin's official Connect *Personal API* (self-service for
 * individuals, launched Oct 2026): a personal API key from Garmin Connect is
 * stored server-side as GARMIN_PERSONAL_API_KEY and exchanged for 24-hour
 * bearer tokens. See src/lib/server/garmin.ts and docs/GARMIN.md.
 */

export type ConnectionState = "not_configured" | "connected" | "error";

export interface ProviderStatus {
  provider: "garmin";
  state: ConnectionState;
  message: string;
}

/** Live check: only reports "connected" if Garmin actually issues a token. */
export async function garminServerStatus(): Promise<ProviderStatus> {
  const { garminKeyConfigured, garminPing } = await import("../server/garmin");
  if (!garminKeyConfigured()) {
    return {
      provider: "garmin",
      state: "not_configured",
      message: "Not connected. Create a Personal API key in Garmin Connect and add it to the server as GARMIN_PERSONAL_API_KEY.",
    };
  }
  try {
    await garminPing();
    return { provider: "garmin", state: "connected", message: "Connected through Garmin's official Personal API." };
  } catch (e) {
    return { provider: "garmin", state: "error", message: (e as Error).message };
  }
}
