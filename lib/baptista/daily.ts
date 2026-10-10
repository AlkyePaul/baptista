/**
 * Battuta o citazione del giorno (B-8): entering the Soggiorno there is always one interaction
 * with Baptista. Content is curated by hand, in Italian; a quote always has its (public domain,
 * verified) author, a joke or an aphorism never has one. Same entry for every member on the same
 * day (household timezone), no randomness.
 *
 * First set (user decision 2026-10-10): one joke and one quote for each main theme of the app —
 * family, personal finance, kitchen, clothes. To be reviewed and extended by the user.
 */

import { dayNumber } from "./select";
import type { Expression } from "./expressions";

export type DailyKind = "joke" | "quote" | "aphorism";
export type DailyEntry =
  | { kind: "joke"; theme: string; text: string }
  | { kind: "aphorism"; theme: string; text: string }
  | { kind: "quote"; theme: string; text: string; author: string; source: string };

export const DAILY: readonly DailyEntry[] = [
  {
    kind: "joke",
    theme: "famiglia",
    text: "In famiglia si divide tutto: le gioie, le fatiche e l'ultimo biscotto. Quest'ultimo, di solito, con meno entusiasmo.",
  },
  {
    kind: "quote",
    theme: "famiglia",
    text: "Tutte le famiglie felici si somigliano; ogni famiglia infelice è infelice a modo suo.",
    author: "Lev Tolstoj",
    source: "Anna Karenina, 1877",
  },
  {
    kind: "joke",
    theme: "finanze",
    text: "Ho controllato i conti di casa: tornano tutti. Purtroppo tornano tutti insieme, a fine mese.",
  },
  {
    kind: "quote",
    theme: "finanze",
    text: "Non è povero chi ha poco, ma chi desidera di più.",
    author: "Seneca",
    source: "Lettere a Lucilio, II",
  },
  {
    kind: "joke",
    theme: "cucina",
    text: "Il frigorifero è l'unico in casa che viene aperto di continuo senza che nessuno gli chieda come sta.",
  },
  {
    kind: "quote",
    theme: "cucina",
    text: "Dimmi che cosa mangi e ti dirò chi sei.",
    author: "Jean Anthelme Brillat-Savarin",
    source: "Fisiologia del gusto, 1825",
  },
  {
    kind: "joke",
    theme: "guardaroba",
    text: "Armadio pieno e niente da mettersi: è il mistero più antico di ogni casa, e confesso di non averne ancora la chiave.",
  },
  {
    kind: "quote",
    theme: "guardaroba",
    text: "L'abito spesso rivela l'uomo.",
    author: "William Shakespeare",
    source: "Amleto, atto I, scena III",
  },
];

/** Introductions that say what is coming (so a joke is never taken for a quote). */
const INTROS: Record<DailyKind, readonly string[]> = {
  joke: ["Una battuta per cominciare la giornata:", "Mi concedi una facezia?"],
  quote: ["Come diceva {autore}:", "Una citazione di {autore}, per oggi:"],
  aphorism: ["Un aforisma per oggi:", "Come si suol dire:"],
};

export type DailyLine = {
  key: string;
  entry: DailyEntry;
  intro: string;
  /** Quotes and aphorisms are shown between « ». */
  text: string;
  author: string | null;
  expression: Expression;
};

/** The entry of a local day: index = day number mod N; intro alternates with the same number. */
export function dailyLine(civilDate: string, entries: readonly DailyEntry[] = DAILY): DailyLine {
  const n = dayNumber(civilDate);
  const entry = entries[((n % entries.length) + entries.length) % entries.length];
  const intros = INTROS[entry.kind];
  const author = entry.kind === "quote" ? entry.author : null;
  const intro = intros[Math.floor(n / entries.length) % intros.length].replace("{autore}", author ?? "");
  return {
    key: `daily:${civilDate}`,
    entry,
    intro,
    text: entry.kind === "joke" ? entry.text : `«${entry.text}»`,
    author,
    expression: entry.kind === "joke" ? "confirmation" : "suggestion",
  };
}
