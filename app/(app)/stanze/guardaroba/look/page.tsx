import type { Metadata } from "next";
import Link from "next/link";
import { LooksGrid } from "@/components/looks-grid";
import { buttonClass, EmptyState, PageHeader } from "@/components/ui";
import { requireExecutionContext } from "@/lib/households/context";
import { listLooks } from "@/services/looks";
import { signedUrls } from "@/services/wardrobe";

export const metadata: Metadata = { title: "Look" };

export default async function LooksPage() {
  const ctx = await requireExecutionContext();
  const looks = await listLooks(ctx);
  const urls = await signedUrls(ctx, looks.map((l) => l.preview_path));

  return (
    <>
      <PageHeader
        title="Look"
        action={
          <Link href="/stanze/guardaroba/look/nuovo" className={buttonClass.primary}>
            + Look
          </Link>
        }
      />
      {looks.length === 0 ? (
        <EmptyState>Nessun look. Crea il tuo primo outfit.</EmptyState>
      ) : (
        <LooksGrid looks={looks} urls={urls} />
      )}
    </>
  );
}
