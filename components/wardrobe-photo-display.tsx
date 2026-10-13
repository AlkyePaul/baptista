"use client";

import { useState } from "react";
import { cx } from "@/components/ui";

type Props = {
  originalUrl: string | null;
  processedUrl: string | null;
  alt: string;
};

/** Toggles between the processed (background-removed) and original photo on the detail page. */
export function WardrobePhotoDisplay({ originalUrl, processedUrl, alt }: Props) {
  const [showOriginal, setShowOriginal] = useState(false);
  const hasBoth = Boolean(originalUrl && processedUrl);
  const displayUrl = showOriginal ? originalUrl : (processedUrl ?? originalUrl);

  return (
    <div className="flex flex-col">
      <div className="flex aspect-[4/5] items-center justify-center bg-foreground/[0.03]">
        {displayUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL of a private object
          <img src={displayUrl} alt={alt} className="h-full w-full object-contain" />
        ) : null}
      </div>
      {hasBoth ? (
        <div className="flex border-t border-border">
          <button
            type="button"
            onClick={() => setShowOriginal(false)}
            className={cx(
              "flex-1 py-2 text-center text-xs font-medium transition",
              !showOriginal ? "bg-accent/10 text-accent" : "text-muted hover:bg-foreground/5",
            )}
          >
            Elaborata
          </button>
          <button
            type="button"
            onClick={() => setShowOriginal(true)}
            className={cx(
              "flex-1 py-2 text-center text-xs font-medium transition",
              showOriginal ? "bg-accent/10 text-accent" : "text-muted hover:bg-foreground/5",
            )}
          >
            Originale
          </button>
        </div>
      ) : null}
    </div>
  );
}
