import { useEffect, useMemo, useState, type CSSProperties } from "react";

import {
  baseFontSizes,
  darkThemeVarsByAppTheme,
  lightThemeVars,
  messageGaps,
  type AppShellTheme,
  type DensityMode,
  type FontSizeMode,
  type ResolvedTheme,
  type ThemeMode
} from "@/src/config/theme";

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function useTheme(input?: { appTheme?: AppShellTheme }) {
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
  const [fontSizeMode, setFontSizeMode] = useState<FontSizeMode>("medium");
  const [densityMode, setDensityMode] = useState<DensityMode>("comfortable");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("dark");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedTheme = window.localStorage.getItem("humtouch_theme_mode") as ThemeMode | null;
    const savedFont = window.localStorage.getItem("humtouch_font_size") as FontSizeMode | null;
    const savedDensity = window.localStorage.getItem("humtouch_density") as DensityMode | null;
    if (savedTheme === "dark" || savedTheme === "light" || savedTheme === "system") {
      setThemeMode(savedTheme);
    }
    if (savedFont === "small" || savedFont === "medium" || savedFont === "large") {
      setFontSizeMode(savedFont);
    }
    if (savedDensity === "comfortable" || savedDensity === "compact") {
      setDensityMode(savedDensity);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("humtouch_theme_mode", themeMode);
    window.localStorage.setItem("humtouch_font_size", fontSizeMode);
    window.localStorage.setItem("humtouch_density", densityMode);
  }, [densityMode, fontSizeMode, themeMode]);

  useEffect(() => {
    if (themeMode !== "system") {
      setResolvedTheme(themeMode);
      return;
    }
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => setResolvedTheme(media.matches ? "light" : "dark");
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [themeMode]);

  useEffect(() => {
    if (themeMode === "system") {
      setResolvedTheme(getSystemTheme());
    }
  }, [themeMode]);

  const cssVars = useMemo(() => {
    const darkPalette = darkThemeVarsByAppTheme[input?.appTheme ?? "APEX"];
    const palette = resolvedTheme === "light" ? lightThemeVars : darkPalette;
    return {
      ...palette,
      "--base-font-size": baseFontSizes[fontSizeMode],
      "--message-gap": messageGaps[densityMode]
    } as CSSProperties;
  }, [densityMode, fontSizeMode, input?.appTheme, resolvedTheme]);

  return {
    themeMode,
    setThemeMode,
    fontSizeMode,
    setFontSizeMode,
    densityMode,
    setDensityMode,
    resolvedTheme,
    cssVars
  };
}
