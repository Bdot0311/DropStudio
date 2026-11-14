"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Library, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/library", label: "Library", icon: Library, match: ["/library", "/projects"] },
  { href: "/settings", label: "Settings", icon: Settings, match: ["/settings"] },
  { href: "/health", label: "Health", icon: Activity, match: ["/health"] },
];

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="sticky top-0 flex h-screen w-14 shrink-0 flex-col border-r bg-card/40 md:w-52">
      <Link href="/library" className="flex h-12 items-center gap-2 border-b px-4">
        <span className="grid h-6 w-6 place-items-center rounded bg-gradient-to-br from-fuchsia-400 to-cyan-400 text-[11px] font-black text-black">D</span>
        <span className="hidden text-sm font-semibold tracking-tight md:inline">Drop Studio</span>
      </Link>
      <nav className="flex flex-col gap-1 p-2">
        {NAV.map(({ href, label, icon: Icon, match }) => {
          const active = match.some((m) => path.startsWith(m));
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                active && "bg-accent text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="hidden md:inline">{label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto hidden p-4 text-[11px] leading-relaxed text-muted-foreground md:block">
        Everything stays on this computer.
      </div>
    </aside>
  );
}
