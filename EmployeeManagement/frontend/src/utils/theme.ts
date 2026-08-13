export type ThemeMode = "light" | "dark";

export const THEME_STORAGE_KEY = "themis_color_theme";

export const getSystemTheme = (): ThemeMode =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

export const getStoredTheme = (): ThemeMode | null => {
  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  return storedTheme === "dark" || storedTheme === "light" ? storedTheme : null;
};

export const applyTheme = (theme: ThemeMode) => {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
};

export const initializeTheme = (): ThemeMode => {
  const theme = getStoredTheme() ?? getSystemTheme();
  applyTheme(theme);
  return theme;
};
