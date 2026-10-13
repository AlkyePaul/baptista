import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { deleteLookAction } from "@/app/actions/looks";
import { ActionButton } from "@/components/forms";
import { LookEditor } from "@/components/look-editor";
import { TextLink } from "@/components/ui";
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
    <>
      <TextLink href="/stanze/guardaroba/look">← Look</TextLink>
      <header className="flex items-end justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">{look.title}</h1>
        <ActionButton action={deleteLookAction.bind(null, look.id)} variant="danger" confirmLabel="Conferma eliminazione">
          Elimina
        </ActionButton>
      </header>
      <LookEditor
        wardrobeItems={wardrobeItems}
        urls={urls}
        lookId={look.id}
        lookVersion={look.version}
        existingTitle={look.title}
        existingItems={lookItems}
      />
    </>
  );
}
