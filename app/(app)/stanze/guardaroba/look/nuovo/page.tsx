import type { Metadata } from "next";
import { LookEditor } from "@/components/look-editor";
import { requireExecutionContext } from "@/lib/households/context";
import { listWardrobe, signedUrls } from "@/services/wardrobe";

export const metadata: Metadata = { title: "Nuovo look" };

export default async function NewLookPage() {
  const ctx = await requireExecutionContext();
  const items = await listWardrobe(ctx, "active");
  const urls = await signedUrls(ctx, items.flatMap((i) => [i.processed_path, i.thumb_path]));
  return <LookEditor wardrobeItems={items} urls={urls} />;
}
