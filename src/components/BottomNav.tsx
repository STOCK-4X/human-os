"use client";

import { Activity, CircleUser, Dumbbell, ListChecks, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

const TABS = [
  { href: "/", label: "Today", icon: Sun, match: (p: string) => p === "/" || p.startsWith("/coach") || p.startsWith("/review") },
  { href: "/health", label: "Health", icon: Activity, match: (p: string) => p.startsWith("/health") },
  { href: "/train", label: "Train", icon: Dumbbell, match: (p: string) => p.startsWith("/train") },
  {
    href: "/habits",
    label: "Habits",
    icon: ListChecks,
    match: (p: string) => p.startsWith("/habits") || p.startsWith("/challenge") || p.startsWith("/experiments") || p.startsWith("/achievements"),
  },
  { href: "/profile", label: "Profile", icon: CircleUser, match: (p: string) => p.startsWith("/profile") },
];

export function BottomNav() {
  const path = usePathname();
  if (path.startsWith("/onboarding")) return null;
  return (
    <nav aria-label="Main" className="fixed inset-x-3 bottom-[max(env(safe-area-inset-bottom),12px)] z-40 mx-auto max-w-lg">
      <ul className="flex rounded-[22px] border border-line bg-[var(--nav)] shadow-[0_8px_30px_rgb(0_0_0/0.08)] backdrop-blur-xl">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const active = match(path);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex min-h-[60px] flex-col items-center justify-center gap-0.5 text-[11px]",
                  active ? "font-bold text-accent" : "font-medium text-muted",
                )}
              >
                <Icon size={22} strokeWidth={active ? 2.2 : 1.8} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
