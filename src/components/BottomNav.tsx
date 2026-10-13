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
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
    >
      <ul className="mx-auto flex max-w-xl">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const active = match(path);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                  active ? "text-accent" : "text-muted",
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
