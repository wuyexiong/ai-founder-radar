export type ThemeMode = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "afr-theme";
export const LEGACY_THEME_STORAGE_KEY = "indieradar-theme";

export function normalizeThemeMode(raw: string | null | undefined): ThemeMode {
  if (raw === "light" || raw === "dark" || raw === "system") {
    return raw;
  }
  return "system";
}

export function resolveEffectiveDark(
  mode: ThemeMode,
  systemPrefersDark: boolean
): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return systemPrefersDark;
}

export function getNextThemeMode(current: ThemeMode): ThemeMode {
  if (current === "system") return "light";
  if (current === "light") return "dark";
  return "system";
}

/**
 * Synchronous <head> script to prevent FOUC before hydration.
 * Defaults to following OS color scheme when unset or set to "system".
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}")||localStorage.getItem("${LEGACY_THEME_STORAGE_KEY}");var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;
