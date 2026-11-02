export type KitPattern = "SOLID" | "SLEEVES" | "STRIPES" | "HALVES" | "SASH";
export type TeamPresentation = { primary: string; secondary: string; accent: string; text: "#ffffff" | "#111827"; pattern: KitPattern };

const TEAMS: Record<number, TeamPresentation> = {
  1: { primary: "#ef0107", secondary: "#ffffff", accent: "#063672", text: "#ffffff", pattern: "SLEEVES" },
  2: { primary: "#670e36", secondary: "#95bfe5", accent: "#f4c542", text: "#ffffff", pattern: "SLEEVES" },
  3: { primary: "#0057b8", secondary: "#ffffff", accent: "#ffcd00", text: "#ffffff", pattern: "STRIPES" },
  4: { primary: "#6c1d45", secondary: "#99d6ea", accent: "#f4c542", text: "#ffffff", pattern: "SLEEVES" },
  5: { primary: "#034694", secondary: "#ffffff", accent: "#dba111", text: "#ffffff", pattern: "SOLID" },
  6: { primary: "#1b458f", secondary: "#ffffff", accent: "#e6c34d", text: "#ffffff", pattern: "SOLID" },
  7: { primary: "#c8102e", secondary: "#1b458f", accent: "#ffffff", text: "#ffffff", pattern: "STRIPES" },
  8: { primary: "#003399", secondary: "#ffffff", accent: "#d71920", text: "#ffffff", pattern: "SOLID" },
  9: { primary: "#111111", secondary: "#ffffff", accent: "#c8a951", text: "#ffffff", pattern: "STRIPES" },
  10: { primary: "#0053a0", secondary: "#fdb913", accent: "#ffffff", text: "#ffffff", pattern: "SOLID" },
  11: { primary: "#c8102e", secondary: "#f6eb61", accent: "#ffffff", text: "#ffffff", pattern: "SOLID" },
  12: { primary: "#6cabdd", secondary: "#ffffff", accent: "#1c2c5b", text: "#111827", pattern: "SOLID" },
  13: { primary: "#da291c", secondary: "#fbe122", accent: "#111111", text: "#ffffff", pattern: "SOLID" },
  14: { primary: "#241f20", secondary: "#ffffff", accent: "#d71920", text: "#ffffff", pattern: "STRIPES" },
  15: { primary: "#d71920", secondary: "#ffffff", accent: "#111111", text: "#ffffff", pattern: "STRIPES" },
  16: { primary: "#e30613", secondary: "#ffffff", accent: "#111111", text: "#ffffff", pattern: "STRIPES" },
  17: { primary: "#132257", secondary: "#ffffff", accent: "#c8a951", text: "#ffffff", pattern: "SOLID" },
  18: { primary: "#7a263a", secondary: "#1bb1e7", accent: "#f4c542", text: "#ffffff", pattern: "SLEEVES" },
  19: { primary: "#fdb913", secondary: "#231f20", accent: "#ffffff", text: "#111827", pattern: "SOLID" },
  20: { primary: "#7a263a", secondary: "#95bfe5", accent: "#ffffff", text: "#ffffff", pattern: "HALVES" },
};

const FALLBACK: TeamPresentation = { primary: "#46564e", secondary: "#dce5df", accent: "#ffffff", text: "#ffffff", pattern: "SOLID" };
export function getTeamPresentation(teamId: number): TeamPresentation { return TEAMS[teamId] ?? FALLBACK; }
export const getTeamColors = getTeamPresentation;
