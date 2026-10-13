import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LookEditor } from "@/components/look-editor";
import { requireExecutionContext } from "@/lib/households/context";
import { getLookWithItems } from "@/services/looks";
import { listWardrobe, signedUrls } from "@/services/wardrobe";

export const metadata: Metadata = { title: "Look" };

export default async function LookDetailPage({ params }: PageProps<"/stanze/guardaroba/look/[id]">) {
  const { id } = await params;
  const ctx = await requireExecutionContext();
  const result = await getLookWithItems(ctx, id);
  if (!result) notFound();
  const { look, items: lookItems } = result;
  const wardrobeItems = await listWardrobe(ctx, "active");
  const urls = await signedUrls(ctx, wardrobeItems.flatMap((i) => [i.processed_path, i.thumb_path]));
  return (
    <LookEditor
      wardrobeItems={wardrobeItems}
      urls={urls}
      lookId={look.id}
      lookVersion={look.version}
      existingTitle={look.title}
      existingItems={lookItems}
    />
  );
}
