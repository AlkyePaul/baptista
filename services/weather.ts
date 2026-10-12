import "server-only";

import { headers } from "next/headers";
import type { WeatherNow } from "@/lib/baptista/greetings";

/**
 * Today's weather for the wardrobe greeting. The place comes from the request geolocation that
 * Vercel adds (approximate, from the IP); without it (local dev) from the household time zone.
 * Open-Meteo needs no key; responses are cached for 30 minutes. Never throws: null on failure.
 */

type Place = { name: string | null; latitude: number; longitude: number };

/** Fallback by time zone: the main city of the zone. */
const ZONE_PLACES: Record<string, Place> = {
  "Europe/Rome": { name: "Roma", latitude: 41.89, longitude: 12.48 },
  "Europe/Zurich": { name: "Zurigo", latitude: 47.37, longitude: 8.54 },
  "Europe/London": { name: "Londra", latitude: 51.51, longitude: -0.13 },
  "Europe/Paris": { name: "Parigi", latitude: 48.86, longitude: 2.35 },
  "Europe/Berlin": { name: "Berlino", latitude: 52.52, longitude: 13.41 },
  "Europe/Madrid": { name: "Madrid", latitude: 40.42, longitude: -3.7 },
  "America/New_York": { name: "New York", latitude: 40.71, longitude: -74.01 },
};

async function placeFor(timeZone: string): Promise<Place | null> {
  const h = await headers();
  const latitude = Number(h.get("x-vercel-ip-latitude"));
  const longitude = Number(h.get("x-vercel-ip-longitude"));
  if (h.get("x-vercel-ip-latitude") && Number.isFinite(latitude) && Number.isFinite(longitude)) {
    const city = h.get("x-vercel-ip-city");
    let name: string | null = null;
    try {
      name = city ? decodeURIComponent(city) : null;
    } catch {
      name = null;
    }
    return { name, latitude, longitude };
  }
  return ZONE_PLACES[timeZone] ?? null;
}

type OpenMeteo = {
  current?: { temperature_2m?: number; weather_code?: number };
  daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_probability_max?: (number | null)[] };
};

export async function getWeather(timeZone: string): Promise<WeatherNow | null> {
  try {
    const place = await placeFor(timeZone);
    if (!place) return null;
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", place.latitude.toFixed(2));
    url.searchParams.set("longitude", place.longitude.toFixed(2));
    url.searchParams.set("current", "temperature_2m,weather_code");
    url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_probability_max");
    url.searchParams.set("forecast_days", "1");
    url.searchParams.set("timezone", "auto");
    const res = await fetch(url, { next: { revalidate: 1800 }, signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const data = (await res.json()) as OpenMeteo;
    const temperature = data.current?.temperature_2m;
    const code = data.current?.weather_code;
    const max = data.daily?.temperature_2m_max?.[0];
    const min = data.daily?.temperature_2m_min?.[0];
    if ([temperature, code, max, min].some((v) => typeof v !== "number")) return null;
    return {
      place: place.name,
      temperature: temperature!,
      code: code!,
      max: max!,
      min: min!,
      rainChance: data.daily?.precipitation_probability_max?.[0] ?? null,
    };
  } catch {
    return null;
  }
}
