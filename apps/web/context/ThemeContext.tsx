"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ThemeMode = "light" | "dark" | "system";
export type AccentColor = "purple" | "blue" | "green";

interface ThemeState {
  mode: ThemeMode;
  accent: AccentColor;
  resolved: "light" | "dark";
  setMode: (mode: ThemeMode) => void;
  setAccent: (accent: AccentColor) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

const STORAGE_KEY_MODE = "ox-theme-mode";
const STORAGE_KEY_ACCENT = "ox-theme-accent";

function readStorage<T extends string>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const raw = localStorage.getItem(key);
  return (raw as T) ?? fallback;
}

function getSystemDark(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => readStorage(STORAGE_KEY_MODE, "dark"));
  const [accent, setAccentState] = useState<AccentColor>(() => readStorage(STORAGE_KEY_ACCENT, "blue"));
  const [systemDark, setSystemDark] = useState(getSystemDark);
  const mounted = useRef(false);

  const resolved: "light" | "dark" = useMemo(() => {
    if (mode !== "system") return mode;
    return systemDark ? "dark" : "light";
  }, [mode, systemDark]);

  useEffect(() => {
    mounted.current = true;
  }, []);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setSystemDark(mql.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    html.classList.toggle("dark", resolved === "dark");
    html.classList.toggle("light", resolved === "light");
    html.setAttribute("data-accent", accent);
  }, [resolved, accent]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    localStorage.setItem(STORAGE_KEY_MODE, next);
  }, []);

  const setAccent = useCallback((next: AccentColor) => {
    setAccentState(next);
    localStorage.setItem(STORAGE_KEY_ACCENT, next);
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, accent, resolved, setMode, setAccent }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeState {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
