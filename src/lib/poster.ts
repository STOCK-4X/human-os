import type { PosterFormat, PosterTheme } from "./types";

/**
 * Achievement poster renderer. Draws directly onto a canvas at the exact
 * export resolution (not a screenshot of the app), so the PNG is crisp.
 */

export const FORMATS: Record<PosterFormat, { w: number; h: number; label: string }> = {
  story: { w: 1080, h: 1920, label: "Story 1080×1920" },
  square: { w: 1080, h: 1080, label: "Square 1080×1080" },
  portrait: { w: 1080, h: 1350, label: "Portrait 1080×1350" },
};

interface Palette {
  bg: [string, string];
  ink: string;
  muted: string;
  accent: string;
  line: string;
}

export const THEMES: Record<PosterTheme, Palette & { label: string }> = {
  sage: { label: "Sage", bg: ["#0f1a17", "#20403a"], ink: "#f4efe6", muted: "rgba(244,239,230,0.62)", accent: "#9fd3bf", line: "rgba(244,239,230,0.16)" },
  sand: { label: "Sand", bg: ["#f5efe4", "#e4d8c3"], ink: "#1b1c1b", muted: "rgba(27,28,27,0.58)", accent: "#3d6b5e", line: "rgba(27,28,27,0.14)" },
  midnight: { label: "Midnight", bg: ["#0b0d14", "#232a45"], ink: "#eeecf7", muted: "rgba(238,236,247,0.6)", accent: "#b9adeb", line: "rgba(238,236,247,0.15)" },
};

export interface PosterContent {
  eyebrow: string;
  headline: string;
  message: string;
  date: string;
  stats: { label: string; value: string }[];
  reflection?: string;
  name?: string;
  progress?: number;
}

type Ctx = CanvasRenderingContext2D & { letterSpacing?: string };

function wrap(ctx: Ctx, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function spacing(ctx: Ctx, px: number) {
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${px}px`;
}

export function drawPoster(canvas: HTMLCanvasElement, format: PosterFormat, theme: PosterTheme, c: PosterContent, fontFamily: string) {
  const { w, h } = FORMATS[format];
  const p = THEMES[theme];
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d") as Ctx;
  const font = (weight: number, size: number) => `${weight} ${size}px ${fontFamily}`;
  const pad = 88;
  const tall = format === "story";

  // Background: soft diagonal gradient + a gentle radial glow.
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, p.bg[0]);
  g.addColorStop(1, p.bg[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w * 0.85, h * 0.12, 0, w * 0.85, h * 0.12, w * 0.9);
  glow.addColorStop(0, `${p.accent}33`);
  glow.addColorStop(1, `${p.accent}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // Motif: concentric open rings (the Human OS mark), top right.
  const cx = w - 150;
  const cy = tall ? 330 : 220;
  ctx.lineCap = "round";
  [210, 160, 110].forEach((r, i) => {
    ctx.strokeStyle = p.accent;
    ctx.globalAlpha = 0.18 + i * 0.12;
    ctx.lineWidth = 14 - i * 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 0.62, Math.PI * 0.62 + Math.PI * 2 * 0.86);
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
  if (c.progress !== undefined) {
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(cx, cy, 210, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, c.progress));
    ctx.stroke();
  }
  ctx.fillStyle = p.accent;
  ctx.beginPath();
  ctx.arc(cx, cy, 34, 0, Math.PI * 2);
  ctx.fill();

  // Brand + eyebrow.
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = p.ink;
  ctx.font = font(600, 30);
  spacing(ctx, 8);
  ctx.fillText("HUMAN OS", pad, pad + 20);
  ctx.fillStyle = p.muted;
  ctx.font = font(500, 26);
  spacing(ctx, 6);
  ctx.fillText(c.eyebrow.toUpperCase(), pad, pad + 66);

  // Headline: auto-fit, up to 4 lines.
  const maxW = w - pad * 2;
  let size = tall ? 132 : format === "portrait" ? 112 : 100;
  let lines: string[] = [];
  spacing(ctx, -2);
  for (; size >= 56; size -= 4) {
    ctx.font = font(700, size);
    lines = wrap(ctx, c.headline.toUpperCase(), maxW);
    if (lines.length <= 4 && lines.every((l) => ctx.measureText(l).width <= maxW)) break;
  }
  const lh = size * 1.0;
  const statsH = c.stats.length ? 210 : 0;
  const reflH = c.reflection ? 150 : 0;
  const footerH = 120;
  const blockH = lines.length * lh + 40 + 60;
  let y = tall ? Math.max(h * 0.42, h - footerH - statsH - reflH - blockH - 140) : Math.max(pad + 200, h - footerH - statsH - reflH - blockH - 40);
  if (format === "square") y = Math.max(pad + 170, y);
  ctx.fillStyle = p.ink;
  for (const l of lines) {
    y += lh;
    ctx.fillText(l, pad - 4, y);
  }

  // Message.
  y += 64;
  ctx.font = font(400, tall ? 44 : 38);
  spacing(ctx, 0);
  ctx.fillStyle = p.muted;
  for (const l of wrap(ctx, c.message, maxW).slice(0, 2)) {
    ctx.fillText(l, pad, y);
    y += tall ? 56 : 48;
  }

  // Stats row.
  if (c.stats.length) {
    y += 40;
    ctx.strokeStyle = p.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(w - pad, y);
    ctx.stroke();
    const n = Math.min(3, c.stats.length);
    const colW = maxW / n;
    c.stats.slice(0, 3).forEach((s, i) => {
      const x = pad + i * colW;
      let vs = n === 1 ? 84 : n === 2 ? 72 : 60;
      ctx.font = font(650, vs);
      while (ctx.measureText(s.value).width > colW - 24 && vs > 30) ctx.font = font(650, (vs -= 4));
      ctx.fillStyle = p.ink;
      spacing(ctx, -1);
      ctx.fillText(s.value, x, y + 40 + vs);
      ctx.font = font(500, 24);
      spacing(ctx, 3);
      ctx.fillStyle = p.muted;
      ctx.fillText(s.label.toUpperCase(), x, y + 40 + vs + 46);
      if (i > 0) {
        ctx.strokeStyle = p.line;
        ctx.beginPath();
        ctx.moveTo(x - 24, y + 36);
        ctx.lineTo(x - 24, y + 40 + vs + 56);
        ctx.stroke();
      }
    });
    y += statsH;
  }

  // Reflection.
  if (c.reflection) {
    ctx.font = font(400, 34);
    spacing(ctx, 0);
    ctx.fillStyle = p.ink;
    let ry = y + 20;
    for (const l of wrap(ctx, `“${c.reflection}”`, maxW).slice(0, 3)) {
      ctx.fillText(l, pad, ry);
      ry += 46;
    }
  }

  // Footer.
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad, h - pad - 50);
  ctx.lineTo(w - pad, h - pad - 50);
  ctx.stroke();
  ctx.font = font(500, 26);
  spacing(ctx, 4);
  ctx.fillStyle = p.muted;
  ctx.fillText(c.date.toUpperCase(), pad, h - pad);
  const right = c.name ? c.name.toUpperCase() : "SMALL HABITS. REAL PROGRESS.";
  ctx.textAlign = "right";
  ctx.fillText(right, w - pad, h - pad);
  ctx.textAlign = "left";
  spacing(ctx, 0);
}

export function posterBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't render the poster."))), "image/png"));
}

/** Native share sheet when available (with the PNG), otherwise a download. */
export async function sharePoster(blob: Blob, filename: string, title: string): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = new File([blob], filename, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "cancelled";
    }
  }
  downloadBlob(blob, filename);
  return "downloaded";
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
