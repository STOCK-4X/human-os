import { Fragment, type ReactNode } from "react";

/**
 * Minimal, safe markdown renderer for coach output: headings, bullet lists,
 * paragraphs, **bold** and *italic*. Builds React nodes only — no raw HTML.
 */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    out.push(tok.startsWith("**") ? <strong key={k++}>{tok.slice(2, -2)}</strong> : <em key={k++}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length)
      blocks.push(
        <ul key={blocks.length} className="my-1.5 list-disc space-y-1 pl-5">
          {list.map((li, i) => (
            <li key={i}>{inline(li)}</li>
          ))}
        </ul>,
      );
    list = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = /^\s*(?:[-*•]|\d+\.)\s+(.*)$/.exec(line);
    const heading = /^#{1,4}\s+(.*)$/.exec(line);
    if (bullet) list.push(bullet[1]);
    else {
      flush();
      if (heading)
        blocks.push(
          <h3 key={blocks.length} className="mt-3 mb-1 text-sm font-semibold first:mt-0">
            {inline(heading[1])}
          </h3>,
        );
      else if (line.trim()) blocks.push(<p key={blocks.length} className="my-1.5">{inline(line)}</p>);
    }
  }
  flush();
  return <div className="text-[15px] leading-relaxed">{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}
