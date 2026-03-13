export type ThemeMode = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";
export type FontSizeMode = "small" | "medium" | "large";
export type DensityMode = "comfortable" | "compact";
export type AppShellTheme = "APEX" | "VEDA" | "NEXUS";

type ThemeVars = Record<string, string>;

const sharedDarkBase: ThemeVars = {
  "--bg-base": "#060b14",
  "--bg-surface": "#0b111c",
  "--bg-elevated": "#121b2a",
  "--bg-input": "#111926",
  "--bg-user-bubble": "#142033",
  "--border": "#1e2b3f",
  "--border-focus": "#2d405c",
  "--text-primary": "#e8edf5",
  "--text-secondary": "#9dacbf",
  "--text-placeholder": "#6f8299",
  "--code-bg": "#0a111d",
  "--error": "#f87171"
};

export const darkThemeVarsByAppTheme: Record<AppShellTheme, ThemeVars> = {
  APEX: {
    ...sharedDarkBase,
    "--accent": "#22b8ff",
    "--accent-hover": "#0ea5e9",
    "--accent-soft": "#22b8ff22"
  },
  VEDA: {
    ...sharedDarkBase,
    "--accent": "#f59e0b",
    "--accent-hover": "#d97706",
    "--accent-soft": "#f59e0b22"
  },
  NEXUS: {
    ...sharedDarkBase,
    "--accent": "#22c55e",
    "--accent-hover": "#16a34a",
    "--accent-soft": "#22c55e22"
  }
};

export const lightThemeVars: ThemeVars = {
  "--bg-base": "#faf8f5",
  "--bg-surface": "#f0ece6",
  "--bg-elevated": "#e8e2db",
  "--bg-input": "#ece7e1",
  "--bg-user-bubble": "#e0d9d1",
  "--border": "#d4cdc5",
  "--border-focus": "#a89990",
  "--text-primary": "#1c1917",
  "--text-secondary": "#6b5c56",
  "--text-placeholder": "#a89990",
  "--accent": "#c9664a",
  "--accent-hover": "#b95a41",
  "--accent-soft": "#c9664a22",
  "--code-bg": "#1a1512",
  "--error": "#ef4444"
};

export const baseFontSizes: Record<FontSizeMode, string> = {
  small: "14px",
  medium: "15px",
  large: "16px"
};

export const messageGaps: Record<DensityMode, string> = {
  comfortable: "28px",
  compact: "16px"
};
