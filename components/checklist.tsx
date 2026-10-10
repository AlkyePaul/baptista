import { removeItemAction, toggleItemAction } from "@/app/actions/domains";
import { ActionButton } from "@/components/forms";
import type { Note } from "@/lib/db/types";

/** Checklist rows of a list or recipe (notes JSONB), shown inside the shared ListAccordion. */
export function ChecklistRows({ note, doneLabel = "fatto" }: { note: Note; doneLabel?: string }) {
  if (!note.items.length) return <p className="px-4 py-3 text-sm text-muted">La lista è vuota.</p>;
  return (
    <ul className="divide-y divide-border">
      {note.items.map((item) => (
        <li key={item.id} className="flex items-center gap-2 px-2 py-1">
          <ActionButton
            action={toggleItemAction.bind(null, note.id, note.version, item.id)}
            label={item.done ? `Segna come da fare: ${item.text}` : `Segna come ${doneLabel}: ${item.text}`}
            className="size-11 px-0"
          >
            {item.done ? (
              <span aria-hidden className="inline-flex size-5 items-center justify-center rounded-md bg-accent text-xs text-on-accent">
                ✓
              </span>
            ) : (
              <span aria-hidden className="inline-block size-5 rounded-md border-2 border-border" />
            )}
          </ActionButton>
          <span className={item.done ? "flex-1 text-muted line-through" : "flex-1"}>{item.text}</span>
          <ActionButton action={removeItemAction.bind(null, note.id, note.version, item.id)} label={`Rimuovi: ${item.text}`} className="size-11 px-0">
            <span aria-hidden>×</span>
          </ActionButton>
        </li>
      ))}
    </ul>
  );
}
