"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { PrivateMark } from "@/components/ui";
import type { Look } from "@/lib/db/types";
import { deleteLookAction } from "@/app/actions/looks";

/** Grid of look preview cards with inline delete. */
export function LooksGrid({ looks, urls }: { looks: Look[]; urls: Map<string, string> }) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (lookId: string) => {
    setDeleting(true);
    await deleteLookAction(lookId);
    setDeleting(false);
    setConfirmId(null);
  };

  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {looks.map((look) => {
        const src = look.preview_path ? urls.get(look.preview_path) : undefined;
        const isConfirming = confirmId === look.id;
        return (
          <li key={look.id} className="relative">
            <Link
              href={`/stanze/guardaroba/look/${look.id}`}
              className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface"
            >
              <span className="flex aspect-[3/4] items-center justify-center bg-foreground/[0.03]">
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                  <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <Icon name="outfit" className="size-10 text-muted" />
                )}
              </span>
              <span className="flex items-center gap-2 px-3 py-2">
                <span className="line-clamp-1 flex-1 text-sm font-medium">{look.title}</span>
                <PrivateMark visibility={look.visibility} />
              </span>
            </Link>

            {/* Delete button / confirmation overlay */}
            {isConfirming ? (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-2xl bg-black/50 backdrop-blur-sm">
                <span className="text-sm font-medium text-white">Eliminare?</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => handleDelete(look.id)}
                    className="rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-white transition disabled:opacity-50"
                  >
                    {deleting ? "…" : "Elimina"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmId(null)}
                    className="rounded-lg bg-white/20 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/30"
                  >
                    Annulla
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setConfirmId(look.id);
                }}
                className="absolute right-2 top-2 z-10 flex size-7 items-center justify-center rounded-full bg-black/40 text-white/80 backdrop-blur-sm transition hover:bg-black/60 hover:text-white"
                aria-label="Elimina look"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="size-3.5" aria-hidden>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
