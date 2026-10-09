import type { Metadata } from "next";
import { createCategoryAction, deleteCategoryAction, updateCategoryAction } from "@/app/actions/categories";
import { ActionButton, ActionForm, ColorField, Field, SubmitButton } from "@/components/forms";
import { Card, EmptyState, PageHeader, Section, TextLink } from "@/components/ui";
import { CATEGORY_COLORS } from "@/lib/categories";
import { requireExecutionContext } from "@/lib/households/context";
import { listMyCategories } from "@/services/categories";

export const metadata: Metadata = { title: "Categorie" };

export default async function CategoriesPage() {
  const ctx = await requireExecutionContext();
  const categories = await listMyCategories(ctx);
  const system = categories.filter((c) => c.owner_user_id === null);
  const mine = categories.filter((c) => c.owner_user_id !== null);
  const palette = (current: string) => (CATEGORY_COLORS.includes(current as never) ? CATEGORY_COLORS : [...CATEGORY_COLORS, current]);

  return (
    <>
      <TextLink href="/abitudini">← Abitudini</TextLink>
      <PageHeader title="Categorie" subtitle="Il colore della categoria colora abitudini e obiettivi." />

      <Section title="Le tue categorie">
        {mine.length ? (
          <ul className="flex flex-col gap-2">
            {mine.map((c) => (
              <li key={c.id}>
                <details className="rounded-2xl border border-border bg-surface">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4">
                    <span aria-hidden className="size-4 rounded-full" style={{ backgroundColor: c.color }} />
                    <span className="flex-1 font-medium">{c.name}</span>
                    <span className="text-sm text-muted">Modifica</span>
                  </summary>
                  <div className="flex flex-col gap-3 border-t border-border p-4">
                    <ActionForm action={updateCategoryAction.bind(null, c.id)} resetOnSuccess={false} successMessage>
                      <input type="hidden" name="version" value={c.version} />
                      <Field label="Nome" name="name" defaultValue={c.name} required />
                      <ColorField colors={palette(c.color)} defaultValue={c.color} />
                      <SubmitButton>Salva</SubmitButton>
                    </ActionForm>
                    <div className="flex justify-end">
                      <ActionButton
                        action={deleteCategoryAction.bind(null, c.id)}
                        variant="danger"
                        confirmLabel="Conferma eliminazione"
                      >
                        Elimina categoria
                      </ActionButton>
                    </div>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>Non hai ancora categorie personali.</EmptyState>
        )}
        <Card className="p-4">
          <ActionForm action={createCategoryAction}>
            <Field label="Nuova categoria" name="name" placeholder="Es. Meditazione" required />
            <ColorField colors={CATEGORY_COLORS} />
            <SubmitButton>Crea categoria</SubmitButton>
          </ActionForm>
        </Card>
        <p className="text-sm text-muted">
          Le tue categorie compaiono solo nel tuo elenco. Se ne usi una su un&apos;abitudine condivisa, gli altri membri
          ne vedono nome e colore su quell&apos;abitudine. Eliminandola, gli elementi restano senza categoria.
        </p>
      </Section>

      <Section title="Categorie di sistema">
        <ul className="flex flex-wrap gap-2">
          {system.map((c) => (
            <li key={c.id} className="flex min-h-10 items-center gap-2 rounded-full border border-border bg-surface px-3 text-sm">
              <span aria-hidden className="size-3 rounded-full" style={{ backgroundColor: c.color }} />
              {c.name}
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
