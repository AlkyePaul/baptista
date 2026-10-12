"use client";

import { useEffect, useState, useTransition } from "react";
import { forgetDeviceLocationAction, saveDeviceLocationAction } from "@/app/actions/location";

const OPTIONS: PositionOptions = { enableHighAccuracy: false, timeout: 10_000, maximumAge: 30 * 60 * 1000 };

type State = "idle" | "asking" | "denied" | "unavailable";

/**
 * Lets the wardrobe weather use the device position (GPS / location services). The browser asks
 * permission only after a tap; once granted, the position is refreshed silently on each visit.
 */
export function DeviceLocation({ active }: { active: boolean }) {
  const [state, setState] = useState<State>("idle");
  const [pending, startTransition] = useTransition();

  function save(position: GeolocationPosition) {
    startTransition(() => saveDeviceLocationAction(position.coords.latitude, position.coords.longitude));
  }

  // Already allowed: keep the position up to date without asking again.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!("geolocation" in navigator) || !navigator.permissions) return;
        const status = await navigator.permissions.query({ name: "geolocation" });
        if (status.state !== "granted" || cancelled) return;
        navigator.geolocation.getCurrentPosition(
          (p) => !cancelled && save(p),
          () => undefined,
          OPTIONS,
        );
      } catch {
        // Permissions API missing (older Safari): the button still works.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function ask() {
    if (!("geolocation" in navigator) || !window.isSecureContext) {
      setState("unavailable");
      return;
    }
    setState("asking");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setState("idle");
        save(p);
      },
      (error) => setState(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable"),
      OPTIONS,
    );
  }

  if (active) {
    return (
      <p className="text-xs text-muted">
        Meteo dalla posizione del dispositivo ·{" "}
        <button type="button" className="font-medium text-accent" disabled={pending} onClick={() => startTransition(() => forgetDeviceLocationAction())}>
          Non usarla più
        </button>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={ask}
        disabled={state === "asking" || pending}
        className="self-start rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-medium"
      >
        {state === "asking" || pending ? "Cerco la posizione…" : "📍 Usa la posizione del dispositivo"}
      </button>
      {state === "denied" ? (
        <p className="text-xs text-muted">Permesso negato. Puoi riattivarlo dalle impostazioni del browser per questo sito.</p>
      ) : state === "unavailable" ? (
        <p className="text-xs text-muted">Posizione non disponibile su questo dispositivo o connessione (serve HTTPS).</p>
      ) : (
        <p className="text-xs text-muted">Resta solo su questo dispositivo, approssimata a circa 1 km.</p>
      )}
    </div>
  );
}
