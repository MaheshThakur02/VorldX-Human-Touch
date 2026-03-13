export interface BrandingConfig {
  appName: string;
  tagline: string;
  logoPath: string;
  logoFallbackInitial: string;
  accentColor: string;
  accentHover: string;
  accentSoft: string;
  welcomeMessage: string;
  welcomeSubtext: string;
  suggestionChips: string[];
}

export const BRANDING: BrandingConfig;
