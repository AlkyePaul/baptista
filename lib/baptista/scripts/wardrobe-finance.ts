import { formatMoney } from "@/lib/money";
import { num, str, type Script } from "./types";

/** A-2: «L'hai comprato?» when a new item is saved. */
export const wardrobeAcquisition: Script = {
  room: "guardaroba",
  detail: (o) => str(o.data.name) || null,
  opening: (o) => {
    const name = str(o.data.name, o.description ?? "");
    return [`Hai aggiunto «${name}». L'hai comprato?`, `«${name}» è nuovo nel guardaroba. È un acquisto?`];
  },
  options: (_o, v) => [
    {
      id: "bought",
      label: "Sì, l'ho comprato",
      primary: true,
      kind: "form",
      form: {
        text: "Quanto l'hai pagato? Senza prezzo non registro nessuna spesa.",
        button: "Registra",
        fields: [
          { kind: "money", name: "price", label: "Prezzo (€)", hint: "Facoltativo ma consigliato" },
          { kind: "date", name: "occurred_on", label: "Data", defaultValue: v.today },
          { kind: "text", name: "merchant", label: "Negozio", hint: "Facoltativo" },
          { kind: "visibility", name: "visibility", defaultValue: "private" },
        ],
      },
    },
    { id: "owned", label: "Era già mio", kind: "execute" },
    { id: "gift", label: "È un regalo", kind: "execute" },
    { id: "later", label: "Più tardi", kind: "snooze", snooze: 72 },
  ],
};

/** C5: a clothing expense without a linked item. */
export const wardrobeFromExpense: Script = {
  room: "finanze",
  opening: (o) => [
    `Hai registrato «${str(o.data.label)}» (${formatMoney(num(o.data.total), str(o.data.currency, "EUR"))}) in Abbigliamento. Vuoi aggiungere il capo al guardaroba?`,
  ],
  options: (o) => [
    { id: "add", label: "Aggiungi il capo", primary: true, kind: "link", href: `/stanze/guardaroba/aggiungi?spesa=${o.source_id}` },
    { id: "no", label: "No, grazie", kind: "dismiss" },
  ],
};

/** C6: 80% / 100% of a monthly budget (household expenses only). */
export const budgetThreshold: Script = {
  room: "finanze",
  opening: (o) => {
    const name = str(o.data.category) || "Il budget totale";
    const spent = formatMoney(num(o.data.spent), str(o.data.currency, "EUR"));
    const budget = formatMoney(num(o.data.budget), str(o.data.currency, "EUR"));
    if (num(o.data.level) >= 100) return [`${name}: budget del mese superato. Spesi ${spent} su ${budget}.`];
    const days = num(o.data.days_left);
    return [`${name}: ${num(o.data.percent)}% del budget e ${days === 1 ? "manca un giorno" : `mancano ${days} giorni`} alla fine del mese.`];
  },
  options: () => [
    { id: "open", label: "Vedi le spese", primary: true, kind: "link", href: "/stanze/finanze/spese" },
    { id: "ok", label: "Va bene", kind: "dismiss" },
  ],
};
