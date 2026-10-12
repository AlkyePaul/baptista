"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { formatGeoCookie, GEO_COOKIE, validCoordinates } from "@/lib/geo";

const COOKIE_OPTIONS = { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 90 } as const;

/** Device position for the weather: a per-device preference, not domain data (see lib/geo.ts). */
export async function saveDeviceLocationAction(latitude: number, longitude: number) {
  const coords = validCoordinates(latitude, longitude);
  if (!coords) return;
  const store = await cookies();
  const value = formatGeoCookie(coords);
  if (store.get(GEO_COOKIE)?.value === value) return;
  store.set(GEO_COOKIE, value, COOKIE_OPTIONS);
  revalidatePath("/");
}

export async function forgetDeviceLocationAction() {
  (await cookies()).delete(GEO_COOKIE);
  revalidatePath("/");
}
