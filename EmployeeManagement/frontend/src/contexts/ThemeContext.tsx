import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { createThemeTransition } from "../utils/themeTransition";

import {
  applyTheme,
  getStoredTheme,
  THEME_STORAGE_KEY,
  type ThemeMode,
} from "../utils/theme";

export type { ThemeMode } from "../utils/theme";

type ThemeContextValue = {
  theme: ThemeMode;
  isDark: boolean;
  setTheme: (theme: ThemeMode, origin?: HTMLElement) => void;
  toggleTheme: (origin?: HTMLElement) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

type ThemeProviderProps = {
  children: ReactNode;
};

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemeMode>(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light",
  );
  const requestedTheme = useRef(theme);
  const [transition] = useState(createThemeTransition);

  useEffect(() => () => transition.cancel(), [transition]);

  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleSystemThemeChange = (event: MediaQueryListEvent) => {
      if (getStoredTheme()) return;
      transition.cancel();
      requestedTheme.current = event.matches ? "dark" : "light";
      setThemeState(requestedTheme.current);
    };

    mediaQuery.addEventListener("change", handleSystemThemeChange);
    return () => mediaQuery.removeEventListener("change", handleSystemThemeChange);
  }, [transition]);

  const setTheme = (nextTheme: ThemeMode, origin?: HTMLElement) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    if (requestedTheme.current === nextTheme) return;
    requestedTheme.current = nextTheme;
    transition.run(() => {
      // Snapshot the committed React state and the root class together.
      flushSync(() => setThemeState(nextTheme));
      applyTheme(nextTheme);
    }, origin);
  };

  const toggleTheme = (origin?: HTMLElement) => {
    setTheme(requestedTheme.current === "dark" ? "light" : "dark", origin);
  };

  return (
    <ThemeContext.Provider
      value={{ theme, isDark: theme === "dark", setTheme, toggleTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }

  return context;
}
