import type { Metadata } from "next";
import { LookEditor } from "@/components/look-editor";
import { TextLink } from "@/components/ui";
import { requireExecutionContext } from "@/lib/households/context";
import { listWardrobe, signedUrls } from "@/services/wardrobe";

export const metadata: Metadata = { title: "Nuovo look" };

export default async function NewLookPage() {
  const ctx = await requireExecutionContext();
  const items = await listWardrobe(ctx, "active");
  const urls = await signedUrls(ctx, items.flatMap((i) => [i.processed_path, i.thumb_path]));

  return (
    <>
      <TextLink href="/stanze/guardaroba/look">← Look</TextLink>
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Nuovo look</h1>
        <p className="text-muted">Trascina i capi per comporre l&apos;outfit.</p>
      </header>
      <LookEditor wardrobeItems={items} urls={urls} />
    </>
  );
}
