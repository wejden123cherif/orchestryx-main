"use client";

import { useEffect, useRef, useState } from "react";
import { Monitor, Moon, Palette, Sun } from "lucide-react";
import {
  useTheme,
  type AccentColor,
  type ThemeMode,
} from "@/context/ThemeContext";
import { cn } from "@/lib/utils";

const modes: { value: ThemeMode; icon: typeof Sun; label: string }[] = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
  { value: "system", icon: Monitor, label: "System" },
];

const accents: { value: AccentColor; label: string; swatch: string }[] = [
  { value: "purple", label: "Purple", swatch: "bg-[#8b5cf6]" },
  { value: "blue", label: "Blue", swatch: "bg-[#3b82f6]" },
  { value: "green", label: "Green", swatch: "bg-[#10b981]" },
];

export function ThemeSwitcher({ compact }: { compact?: boolean }) {
  const { mode, accent, setMode, setAccent } = useTheme();

  return (
    <div className={cn("space-y-3", compact && "space-y-2")}>
      <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/60 p-1">
        {modes.map((m) => {
          const Icon = m.icon;
          const active = mode === m.value;
          return (
            <button
              key={m.value}
              type="button"
              onClick={() => setMode(m.value)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-label={m.label}
            >
              <Icon className="h-3.5 w-3.5" />
              {!compact && <span>{m.label}</span>}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        {accents.map((a) => (
          <button
            key={a.value}
            type="button"
            onClick={() => setAccent(a.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium transition",
              accent === a.value
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
            aria-label={`${a.label} accent`}
          >
            <span className={cn("h-3 w-3 rounded-full", a.swatch)} />
            {!compact && <span>{a.label}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ThemeModeToggle() {
  const { resolved, setMode } = useTheme();

  return (
    <button
      type="button"
      onClick={() => setMode(resolved === "dark" ? "light" : "dark")}
      className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
      aria-label="Toggle theme"
    >
      {resolved === "dark" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </button>
  );
}

export function ThemePopover() {
  const { mode, accent, setMode, setAccent } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
        aria-label="Theme settings"
      >
        <Palette className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-52 rounded-lg border border-border bg-popover p-2.5 shadow-lg">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/60">
            Mode
          </p>
          <div className="flex items-center gap-1 rounded-md border border-border bg-muted/60 p-0.5">
            {modes.map((m) => {
              const Icon = m.icon;
              const active = mode === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMode(m.value)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium transition",
                    active
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  aria-label={m.label}
                >
                  <Icon className="h-3 w-3" />
                  {m.label}
                </button>
              );
            })}
          </div>

          <p className="mb-2 mt-3 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/60">
            Accent
          </p>
          <div className="flex items-center gap-1.5">
            {accents.map((a) => (
              <button
                key={a.value}
                type="button"
                onClick={() => setAccent(a.value)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md border py-1.5 text-[11px] font-medium transition",
                  accent === a.value
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
                aria-label={`${a.label} accent`}
              >
                <span className={cn("h-2.5 w-2.5 rounded-full", a.swatch)} />
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
