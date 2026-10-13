/** Guardaroba vocabulary (D28: manual classification). Ids are stable, labels are Italian. */

export const CLOTHING_TYPES = [
  { id: "top", label: "Maglie e camicie" },
  { id: "knitwear", label: "Maglioni e felpe" },
  { id: "bottom", label: "Pantaloni e gonne" },
  { id: "dress", label: "Abiti" },
  { id: "outerwear", label: "Giacche e cappotti" },
  { id: "shoes", label: "Scarpe" },
  { id: "accessory", label: "Accessori" },
  { id: "sportswear", label: "Sport" },
  { id: "underwear", label: "Intimo" },
  { id: "other", label: "Altro" },
] as const;
export type ClothingType = (typeof CLOTHING_TYPES)[number]["id"];

export const COLORS = [
  { id: "black", label: "Nero", hex: "#1f1f1f" },
  { id: "white", label: "Bianco", hex: "#f5f5f0" },
  { id: "grey", label: "Grigio", hex: "#9a9a9a" },
  { id: "navy", label: "Blu scuro", hex: "#1f2f5a" },
  { id: "blue", label: "Blu", hex: "#2f62c4" },
  { id: "light_blue", label: "Azzurro", hex: "#8cc4ea" },
  { id: "green", label: "Verde", hex: "#3f8a4f" },
  { id: "yellow", label: "Giallo", hex: "#e8c43a" },
  { id: "orange", label: "Arancione", hex: "#e6873a" },
  { id: "red", label: "Rosso", hex: "#c43a3a" },
  { id: "pink", label: "Rosa", hex: "#e89ab4" },
  { id: "purple", label: "Viola", hex: "#7a4fb0" },
  { id: "brown", label: "Marrone", hex: "#7a5233" },
  { id: "beige", label: "Beige", hex: "#d8c4a0" },
  { id: "multicolor", label: "Multicolore", hex: "conic-gradient(#c43a3a, #e8c43a, #3f8a4f, #2f62c4, #7a4fb0, #c43a3a)" },
] as const;
export type ColorId = (typeof COLORS)[number]["id"];

export const PATTERNS = [
  { id: "solid", label: "Tinta unita" },
  { id: "stripes", label: "Righe" },
  { id: "checks", label: "Quadri" },
  { id: "dots", label: "Pois" },
  { id: "floral", label: "Fiori" },
  { id: "print", label: "Stampa" },
  { id: "other", label: "Altro" },
] as const;

export const SEASONS = [
  { id: "spring", label: "Primavera" },
  { id: "summer", label: "Estate" },
  { id: "autumn", label: "Autunno" },
  { id: "winter", label: "Inverno" },
] as const;
export type Season = (typeof SEASONS)[number]["id"];

export const FORMALITIES = [
  { id: "casual", label: "Casual" },
  { id: "smart", label: "Elegante casual" },
  { id: "formal", label: "Elegante" },
  { id: "sport", label: "Sportivo" },
] as const;

/** Meteorological seasons (northern hemisphere) for a civil date: Dec–Feb winter, etc. */
export function seasonOf(civilDate: string): Season {
  const month = Number(civilDate.slice(5, 7));
  if (month === 12 || month <= 2) return "winter";
  if (month <= 5) return "spring";
  if (month <= 8) return "summer";
  return "autumn";
}

/** Free-text tags: comma separated, trimmed, lower-case, unique, at most 20 of 30 chars. */
export function parseTags(raw: string | undefined): string[] {
  const seen = new Set<string>();
  for (const part of (raw ?? "").split(",")) {
    const tag = part.trim().toLowerCase().slice(0, 30);
    if (tag) seen.add(tag);
  }
  return [...seen].slice(0, 20);
}

export function colorHex(id: string | null): string | null {
  return COLORS.find((c) => c.id === id)?.hex ?? null;
}

/** Default flat-lay canvas placements per clothing type (x, y as 0-1 fractions, scale). */
export const DEFAULT_PLACEMENT: Record<string, { x: number; y: number; scale: number }> = {
  accessory:  { x: 0.50, y: 0.08, scale: 0.55 },
  top:        { x: 0.50, y: 0.25, scale: 0.80 },
  knitwear:   { x: 0.50, y: 0.25, scale: 0.80 },
  outerwear:  { x: 0.50, y: 0.20, scale: 0.90 },
  dress:      { x: 0.50, y: 0.35, scale: 0.85 },
  bottom:     { x: 0.50, y: 0.55, scale: 0.75 },
  shoes:      { x: 0.50, y: 0.82, scale: 0.55 },
  sportswear: { x: 0.50, y: 0.40, scale: 0.75 },
  underwear:  { x: 0.50, y: 0.40, scale: 0.60 },
  other:      { x: 0.50, y: 0.40, scale: 0.70 },
};
