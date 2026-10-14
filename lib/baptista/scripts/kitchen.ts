import { slotForHour } from "@/lib/nutrition";
import { capitalize, dayPhrase, num, place, str, vocative, type Script } from "./types";

const later = { id: "later", label: "Più tardi", kind: "snooze", snooze: 4 } as const;

/** Mockup script (B-3): «Il pollo scade domani. È ancora in frigo?» */
export const foodExpiry: Script = {
  room: "cucina",
  facts: (o) => ({ estimated: o.data.estimated === true }),
  detail: (o) => `${str(o.data.name)} · ${capitalize(place(o.data.storage).replace(/^in /, ""))}`,
  opening: (o, v) => {
    const name = str(o.data.name, o.title);
    const where = place(o.data.storage);
    const date = str(o.data.expires_on);
    const days = num(o.data.days_left);
    if (o.data.estimated === true) {
      return [
        `Se ${name} è ancora ${where}, dai un'occhiata: la data di ${dayPhrase(date, v.today)} è solo una stima.`,
        `${capitalize(name)} ha una data stimata, ${dayPhrase(date, v.today)}. È ancora ${where}?`,
      ];
    }
    if (days < 0) {
      return [`${vocative(v)}${name} aveva la data di ${dayPhrase(date, v.today)}. È ancora ${where}?`];
    }
    const when = days === 0 ? "scade oggi" : days === 1 ? "scade domani" : `scade ${dayPhrase(date, v.today)}`;
    return [
      `${vocative(v)}${name} ${when}. È ancora ${where}?`,
      `${vocative(v)}una piccola faccenda ${where}: ${name} ${when}. C'è ancora?`,
    ];
  },
  options: (o) => [
    {
      id: "still",
      label: "Sì, c'è ancora",
      primary: true,
      kind: "snooze",
      snooze: "morning",
      snoozeText: "Bene. Te lo ricordo domattina se è ancora lì.",
    },
    {
      id: "eaten",
      label: "L'abbiamo mangiato",
      kind: "confirm",
      confirm: { text: "Lo segno come consumato?", button: "Segna come consumato", detail: `${str(o.data.name)} · ${capitalize(place(o.data.storage).replace(/^in /, ""))}` },
    },
    later,
  ],
};

/** old_food and food_opened: a reminder to check, never a statement about safety. */
export const foodCheck: Script = {
  room: "cucina",
  facts: () => ({ estimated: true }),
  detail: (o) => `${str(o.data.name)} · ${capitalize(place(o.data.storage).replace(/^in /, ""))}`,
  opening: (o) => {
    const name = str(o.data.name, o.title);
    const days = num(o.data.days);
    return o.type === "food_opened"
      ? [`${capitalize(name)} è aperto da ${days} giorni. Dai un'occhiata a com'è?`, `Sono ${days} giorni che ${name} è aperto: meglio controllare com'è.`]
      : [`${capitalize(name)} è ${place(o.data.storage)} da ${days} giorni, senza data. Dai un'occhiata?`];
  },
  options: (o) => [
    { id: "fine", label: "È ancora buono", primary: true, kind: "snooze", snooze: 48, snoozeText: "Bene. Ne riparliamo tra un paio di giorni." },
    { id: "eaten", label: "L'abbiamo finito", kind: "confirm", confirm: { text: "Lo segno come consumato?", button: "Segna come consumato", detail: str(o.data.name) } },
    { id: "thrown", label: "L'ho buttato", kind: "confirm", confirm: { text: "Lo segno come buttato?", button: "Segna come buttato", detail: str(o.data.name) } },
  ],
};

/** C2: «Il latte è finito. Lo aggiungo alla lista?» */
export const restock: Script = {
  room: "cucina",
  opening: (o) => {
    const name = str(o.data.name);
    return [`${capitalize(name)} è finito. Lo aggiungo alla Lista della spesa?`, `${capitalize(name)}: non ce n'è più. Lo metto in lista?`];
  },
  options: () => [
    { id: "add", label: "Sì, aggiungi", primary: true, kind: "execute" },
    { id: "no", label: "No, grazie", kind: "dismiss" },
  ],
};

/** C4: diary entry for who marked it eaten (grams chosen in a typed field). */
export const dietLog: Script = {
  room: "cucina",
  opening: (o) => [`${capitalize(str(o.data.name))} è finito. Lo aggiungo al tuo diario di oggi?`],
  options: (o, v) => [
    {
      id: "log",
      label: "Sì, aggiungi",
      primary: true,
      kind: "form",
      form: {
        text: "Quanti grammi, più o meno?",
        button: "Aggiungi al diario",
        fields: [
          { kind: "number", name: "grams", label: "Grammi", defaultValue: "100", hint: `${num(o.data.kcal_100g)} kcal ogni 100 g` },
          { kind: "slot", name: "slot", label: "Pasto", defaultValue: slotForHour(v.hour) },
        ],
      },
    },
    { id: "no", label: "No", kind: "dismiss" },
  ],
};

/** C1: only after «Tutto in dispensa». */
export const shoppingExpense: Script = {
  room: "cucina",
  opening: (o) => {
    const n = num(o.data.count);
    return [
      `Hai messo in dispensa ${n === 1 ? "un prodotto" : `${n} prodotti`}. Vuoi registrare la spesa?`,
      `Spesa sistemata: ${n === 1 ? "un prodotto" : `${n} prodotti`} in dispensa. La registro in Finanze?`,
    ];
  },
  options: (o) => [
    {
      id: "record",
      label: "Sì, registra",
      primary: true,
      kind: "form",
      form: {
        text: "Quanto hai speso in tutto?",
        button: "Registra la spesa",
        fields: [
          { kind: "money", name: "total", label: "Totale (€)" },
          { kind: "text", name: "merchant", label: "Negozio", hint: "Facoltativo" },
          { kind: "date", name: "occurred_on", label: "Data", defaultValue: str(o.data.stocked_on) },
          { kind: "visibility", name: "visibility", defaultValue: "private" },
        ],
      },
    },
    { id: "no", label: "No, grazie", kind: "dismiss" },
  ],
};

/** C8: suggestion to mark a frequent product as a staple; «No» is remembered for good. */
export const stapleSuggestion: Script = {
  room: "cucina",
  opening: (o) => [`Compri spesso ${str(o.data.name)}: ${num(o.data.count)} volte negli ultimi due mesi. Lo segno come abituale?`],
  options: () => [
    { id: "yes", label: "Sì, è abituale", primary: true, kind: "execute" },
    { id: "never", label: "No, non chiederlo più", kind: "execute" },
  ],
};

/** C8: missing staples, grouped; the user ticks what to add. */
export const staplesMissing: Script = {
  room: "cucina",
  opening: (o) => {
    const items = Array.isArray(o.data.items) ? (o.data.items as Array<{ name?: unknown }>) : [];
    const names = items.map((i) => str(i.name)).filter(Boolean);
    const list = names.length <= 3 ? names.join(", ").replace(/, ([^,]*)$/, " e $1") : `${names.slice(0, 3).join(", ")} e altri`;
    return names.length === 1
      ? [`Manca un prodotto abituale: ${list}. Lo aggiungo alla lista?`]
      : [`Mancano ${names.length} prodotti abituali: ${list}. Li aggiungo alla lista?`];
  },
  options: (o) => {
    const items = Array.isArray(o.data.items) ? (o.data.items as Array<{ id?: unknown; name?: unknown }>) : [];
    return [
      {
        id: "add",
        label: "Scegli cosa aggiungere",
        primary: true,
        kind: "form",
        form: {
          text: "Spunta quelli da comprare.",
          button: "Aggiungi alla lista",
          fields: [{ kind: "checklist", name: "item", items: items.map((i) => ({ value: str(i.id), label: str(i.name) })) }],
        },
      },
      later,
    ];
  },
};
