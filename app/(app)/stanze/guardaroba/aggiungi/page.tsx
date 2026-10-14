import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CLOTHING_TYPES, CLOTHING_TYPE_IMAGE } from "@/lib/wardrobe";

export const metadata: Metadata = { title: "Aggiungi capo" };

/** Category picker: choose what you're adding, then go to the type-specific form. */
export default async function AddClothingPage({ searchParams }: PageProps<"/stanze/guardaroba/aggiungi">) {
  const params = await searchParams;
  // Preserve ?spesa= for C5 integration passthrough.
  const spesaParam = typeof params.spesa === "string" ? `&spesa=${params.spesa}` : "";

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Cosa vuoi aggiungere?</h1>
        <p className="text-muted">Scegli la categoria del capo.</p>
      </header>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-3">
        {CLOTHING_TYPES.map((t) => (
          <Link
            key={t.id}
            href={`/stanze/guardaroba/aggiungi/capo?tipo=${t.id}${spesaParam}`}
            className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-surface p-3 text-center transition active:scale-[0.98] hover:border-accent hover:bg-accent/5"
          >
            <Image src={CLOTHING_TYPE_IMAGE[t.id]} alt="" width={40} height={40} className="size-10 object-contain" />
            <span className="text-sm font-medium">{t.label}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
