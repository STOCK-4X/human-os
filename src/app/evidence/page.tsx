import Link from "next/link";
import { METHODS, type Method } from "@/lib/evidence";

export const metadata = { title: "Methods & evidence · Human OS" };

export default function EvidencePage() {
  const areas = [...new Set(METHODS.map((m) => m.area))];
  return (
    <main className="mx-auto w-full max-w-xl px-4 pt-[max(env(safe-area-inset-top),1.5rem)] pb-32">
      <Link href="/profile" className="text-sm text-muted">
        ← Profile
      </Link>
      <h1 className="mt-2 text-[28px] leading-tight font-extrabold tracking-[-0.02em]">Methods & evidence</h1>
      <p className="mt-1 text-sm text-muted">
        Every Human OS calculation uses a published method from sport science, coaching or sleep research. These are estimates to guide decisions — not
        medical advice.
      </p>
      {areas.map((area) => (
        <section key={area} className="mt-6">
          <h2 className="eyebrow mb-2">{area}</h2>
          <div className="space-y-3">
            {METHODS.filter((m) => m.area === area).map((m) => (
              <MethodCard key={m.id} m={m} />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}

function MethodCard({ m }: { m: Method }) {
  return (
    <article id={m.id} className="card">
      <h3 className="text-[15px] font-semibold">{m.title}</h3>
      <p className="mt-0.5 text-xs text-accent">{m.inApp}</p>
      <p className="mt-2 text-sm">{m.how}</p>
      {m.caveat && <p className="mt-2 text-sm text-muted">Caveat: {m.caveat}</p>}
      <ul className="mt-3 space-y-1 border-t border-line pt-2 text-xs text-muted">
        {m.sources.map((s) => (
          <li key={s.cite}>
            {s.cite}
            {s.note && <span> — {s.note}</span>}
          </li>
        ))}
      </ul>
    </article>
  );
}
