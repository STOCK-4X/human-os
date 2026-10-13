import Anthropic from "@anthropic-ai/sdk";
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { CoachPayloadSchema } from "@/lib/coach";
import { COACH_SYSTEM_PROMPT, taskFor } from "@/lib/server/coach-prompt";

/**
 * AI coach endpoint. Runs only on the server: the Anthropic key is read from
 * the environment and never reaches the browser. The client sends a minimised,
 * schema-validated snapshot (see src/lib/coach.ts); nothing is stored here.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = process.env.COACH_MODEL || "claude-opus-5-5";
const MAX_BODY_BYTES = 64_000;
const RATE_LIMIT = Number(process.env.COACH_RATE_LIMIT_PER_HOUR || 30);

// Best-effort, per-instance limiter. On serverless hosts each instance has its
// own window; COACH_ACCESS_TOKEN is the real protection for a public deploy.
const hits = new Map<string, number[]>();
function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 3_600_000);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > RATE_LIMIT;
}

function tokenOk(req: NextRequest): boolean {
  const expected = process.env.COACH_ACCESS_TOKEN;
  if (!expected) return true;
  const given = req.headers.get("x-coach-token") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const configured = () => Boolean(process.env.ANTHROPIC_API_KEY);

export async function GET() {
  return NextResponse.json({
    configured: configured(),
    requiresToken: Boolean(process.env.COACH_ACCESS_TOKEN),
    model: MODEL,
  });
}

export async function POST(req: NextRequest) {
  if (!configured()) {
    return NextResponse.json(
      { error: "not_configured", message: "AI coach is not configured on the server (ANTHROPIC_API_KEY missing)." },
      { status: 503 },
    );
  }
  if (!tokenOk(req)) {
    return NextResponse.json({ error: "unauthorized", message: "Coach access token missing or wrong." }, { status: 401 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "rate_limited", message: "Too many coach requests this hour." }, { status: 429 });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "too_large", message: "Request too large." }, { status: 413 });
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Invalid JSON." }, { status: 400 });
  }
  const parsed = CoachPayloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request", message: "Payload failed validation." }, { status: 400 });
  }
  const payload = parsed.data;
  if (payload.kind === "chat" && !payload.question?.trim()) {
    return NextResponse.json({ error: "bad_request", message: "Question is empty." }, { status: 400 });
  }

  const { history, question: _q, ...snapshot } = payload;
  void _q;
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...(history ?? []).map((h) => ({ role: h.role, content: h.content })),
    {
      role: "user",
      content: `My current data (JSON):\n${JSON.stringify(snapshot)}\n\n${taskFor(payload)}`,
    },
  ];
  // The API needs alternating turns starting with the user.
  while (messages.length && messages[0].role !== "user") messages.shift();

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: COACH_SYSTEM_PROMPT,
      output_config: { effort: payload.kind === "chat" ? "low" : "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages,
    });
    if (response.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "refused", message: "The coach couldn't answer that request. Try rephrasing." },
        { status: 422 },
      );
    }
    const text = response.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("\n")
      .trim();
    if (!text) {
      return NextResponse.json({ error: "empty", message: "The coach returned no text." }, { status: 502 });
    }
    return NextResponse.json({ content: text, model: response.model, truncated: response.stop_reason === "max_tokens" });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "server_auth", message: "Server AI key is invalid." }, { status: 502 });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "upstream_rate_limited", message: "AI service is busy — try again shortly." }, { status: 503 });
    }
    if (error instanceof Anthropic.APIError) {
      console.error("coach upstream error", error.status, error.message);
      return NextResponse.json({ error: "upstream", message: `AI service error (${error.status ?? "network"}).` }, { status: 502 });
    }
    console.error("coach error", error);
    return NextResponse.json({ error: "internal", message: "Unexpected server error." }, { status: 500 });
  }
}
