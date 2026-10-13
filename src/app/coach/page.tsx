"use client";

import { ArrowUp, RefreshCw } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Markdown } from "@/components/Markdown";
import { Card, Loading, Notice, Page, SourceBadge } from "@/components/ui";
import { useDataSet, useOnline, useToday } from "@/hooks/data";
import { buildBriefing } from "@/lib/briefing";
import { buildCoachPayload } from "@/lib/coach";
import { askCoach } from "@/lib/coach-client";
import { db } from "@/lib/db";
import { formatInstant, nowIso } from "@/lib/date";
import type { DataSet } from "@/lib/reports";
import type { AiSummary, DayKey } from "@/lib/types";

const PROMPTS = [
  "What should I prioritise today?",
  "What workout fits how I am today?",
  "I slept poorly — how should I handle today?",
  "How can I make my morning routine easier?",
  "How do I balance work, exercise and recovery this week?",
];

export default function CoachPage() {
  const data = useDataSet();
  const today = useToday(data?.profile.timeZone);
  return (
    <Page title="Coach" subtitle="Uses your actual data. Not medical advice.">
      {!data || !today ? <Loading /> : <Coach data={data} today={today} />}
    </Page>
  );
}

function Coach({ data, today }: { data: DataSet; today: DayKey }) {
  const online = useOnline();
  const { profile } = data;
  const summaries = useLiveQuery(() => db.aiSummaries.where("date").equals(today).toArray(), [today]);
  const memory = useLiveQuery(() => db.coachMemory.toArray(), []);
  const [busy, setBusy] = useState<"daily" | "chat">();
  const [error, setError] = useState<string>();
  const [q, setQ] = useState("");
  const daily = summaries?.filter((s) => s.kind === "daily").at(-1);
  const chat = (summaries ?? []).filter((s) => s.kind === "chat").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const brief = buildBriefing(data, today);
  const mem = (memory ?? []).map((m) => m.text);

  async function generate() {
    setBusy("daily");
    setError(undefined);
    const res = await askCoach(buildCoachPayload(data, "daily", mem), profile.coachToken);
    if (res.ok) await db.aiSummaries.add({ kind: "daily", date: today, content: res.content, model: res.model, createdAt: nowIso() });
    else setError(res.message);
    setBusy(undefined);
  }

  async function ask(question: string) {
    if (!question.trim()) return;
    setBusy("chat");
    setError(undefined);
    const history = chat.slice(-5).flatMap((c) => [
      { role: "user" as const, content: c.question ?? "" },
      { role: "assistant" as const, content: c.content },
    ]);
    const res = await askCoach(buildCoachPayload(data, "chat", mem, question.trim(), history), profile.coachToken);
    if (res.ok) {
      await db.aiSummaries.add({ kind: "chat", date: today, question: question.trim(), content: res.content, model: res.model, createdAt: nowIso() });
      setQ("");
    } else setError(res.message);
    setBusy(undefined);
  }

  if (!profile.aiEnabled) {
    return (
      <>
        <Notice>The AI coach is turned off in Profile. Here is your calculated guidance instead.</Notice>
        <CalculatedBrief brief={brief} />
      </>
    );
  }

  return (
    <>
      {brief.safety && <Notice tone="bad">{brief.safety}</Notice>}
      <Card
        title="Morning briefing"
        action={
          daily && (
            <button className="btn-quiet min-h-9 px-2 text-sm" onClick={generate} disabled={!!busy || !online} aria-label="Regenerate briefing">
              <RefreshCw size={14} className={busy === "daily" ? "animate-spin" : ""} />
            </button>
          )
        }
      >
        {daily ? (
          <AiBlock s={daily} tz={profile.timeZone} />
        ) : (
          <>
            <p className="text-sm text-muted">Generate a short briefing from last night&apos;s sleep, recovery, recent activity and your habits.</p>
            <button className="btn-primary mt-3 w-full" onClick={generate} disabled={!!busy || !online}>
              {busy === "daily" ? "Thinking…" : "Generate today's briefing"}
            </button>
          </>
        )}
      </Card>

      {error && (
        <>
          <Notice tone="warn">{error} Showing your calculated guidance below.</Notice>
          <CalculatedBrief brief={brief} />
        </>
      )}

      <Card title="Ask">
        {chat.length > 0 && (
          <ul className="mb-4 space-y-4">
            {chat.map((c) => (
              <li key={c.id} className="space-y-2">
                <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-accent px-3 py-2 text-sm text-accent-ink">{c.question}</div>
                <div className="rounded-2xl rounded-bl-md bg-surface-2 px-3 py-2">
                  <AiBlock s={c} tz={profile.timeZone} compact />
                </div>
              </li>
            ))}
          </ul>
        )}
        {chat.length === 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {PROMPTS.map((p) => (
              <button key={p} className="chip text-left" onClick={() => ask(p)} disabled={!!busy || !online}>
                {p}
              </button>
            ))}
          </div>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(q);
          }}
        >
          <input className="input" aria-label="Ask the coach" placeholder={online ? "Ask anything about your day…" : "Offline"} value={q} onChange={(e) => setQ(e.target.value)} disabled={!online} maxLength={2000} />
          <button className="btn-primary w-11 shrink-0 px-0" aria-label="Send" disabled={!!busy || !q.trim() || !online}>
            {busy === "chat" ? <RefreshCw size={16} className="animate-spin" /> : <ArrowUp size={18} />}
          </button>
        </form>
      </Card>

      <p className="text-xs text-muted">
        The coach is an AI and can be wrong. It doesn&apos;t diagnose, prescribe or replace a doctor. If something feels seriously wrong, contact a health professional.
      </p>
    </>
  );
}

function AiBlock({ s, tz, compact }: { s: AiSummary; tz: string; compact?: boolean }) {
  const [fix, setFix] = useState(false);
  const [text, setText] = useState(s.correction ?? "");
  return (
    <div>
      <Markdown text={s.content} />
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        <SourceBadge source="ai" />
        <span>{formatInstant(s.createdAt, tz)}</span>
        {!compact && <span>· {s.model}</span>}
        <button className="ml-auto underline" onClick={() => setFix((v) => !v)}>{s.correction ? "Edit correction" : "Something wrong?"}</button>
      </div>
      {s.correction && !fix && <p className="mt-1 text-xs">Your correction: {s.correction}</p>}
      {fix && (
        <form
          className="mt-2 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            await db.aiSummaries.update(s.id!, { correction: text.trim() || undefined });
            if (text.trim()) await db.coachMemory.add({ text: `Correction: ${text.trim().slice(0, 280)}`, createdAt: nowIso() });
            setFix(false);
          }}
        >
          <input className="input" aria-label="Correction" placeholder="What did it get wrong?" value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn-ghost">Save</button>
        </form>
      )}
    </div>
  );
}

function CalculatedBrief({ brief }: { brief: ReturnType<typeof buildBriefing> }) {
  return (
    <Card title="Calculated guidance" action={<SourceBadge source="calculated" />}>
      <p className="font-medium">{brief.focus}</p>
      <p className="mt-1 text-sm text-muted">{brief.small_action}</p>
      <p className="mt-2 text-sm">
        <strong>Training:</strong> {brief.training.headline}
      </p>
      <p className="mt-1 text-sm">
        <strong>Tonight:</strong> wind down {brief.bedtime.windDownStart}, lights out {brief.bedtime.lightsOut}.
      </p>
      {brief.attention.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm">{brief.attention.map((a) => <li key={a}>{a}</li>)}</ul>}
      {brief.training.general && <p className="mt-2 text-xs text-muted">Based on general principles — log sleep and a check-in to personalise.</p>}
    </Card>
  );
}
