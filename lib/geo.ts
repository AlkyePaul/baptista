/**
 * Device position for the weather (user 2026-10-12): read once with the browser permission and
 * kept only in an httpOnly cookie of that device, rounded to 2 decimals (~1 km). Never stored in
 * the database nor shared with the household.
 */

export const GEO_COOKIE = "baptista_geo";

export type Coordinates = { latitude: number; longitude: number };

const round = (n: number) => Math.round(n * 100) / 100;

export function validCoordinates(latitude: unknown, longitude: unknown): Coordinates | null {
  if (typeof latitude !== "number" || typeof longitude !== "number") return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude: round(latitude), longitude: round(longitude) };
}

export function formatGeoCookie(c: Coordinates): string {
  return `${c.latitude.toFixed(2)},${c.longitude.toFixed(2)}`;
}

export function parseGeoCookie(value: string | undefined): Coordinates | null {
  const match = value?.match(/^(-?\d{1,2}(?:\.\d{1,2})?),(-?\d{1,3}(?:\.\d{1,2})?)$/);
  return match ? validCoordinates(Number(match[1]), Number(match[2])) : null;
}
