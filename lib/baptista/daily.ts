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

    // ---------------------------------------------------------------------------
  // FAMIGLIA / RELAZIONI
  // ---------------------------------------------------------------------------

  {
    kind: "quote",
    theme: "famiglia",
    text: "Se vuoi essere amato, ama.",
    author: "Seneca",
    source: "Lettere a Lucilio, IX, 6",
  },
  {
    kind: "quote",
    theme: "famiglia",
    text: "Nessun uomo è un'isola, intero in se stesso.",
    author: "John Donne",
    source: "Devotions upon Emergent Occasions, Meditation XVII, 1624",
  },
  {
    kind: "quote",
    theme: "famiglia",
    text: "Gli amici che hai messo alla prova, legali all'anima con cerchi d'acciaio.",
    author: "William Shakespeare",
    source: "Amleto, atto I, scena III",
  },
  {
    kind: "quote",
    theme: "famiglia",
    text: "L'amicizia raddoppia le gioie e dimezza i dolori.",
    author: "Francis Bacon",
    source: "Essays, Of Friendship, 1625",
  },
  {
    kind: "quote",
    theme: "famiglia",
    text: "L'amicizia rende più luminosa la prosperità e più lieve l'avversità, dividendola e condividendola.",
    author: "Cicerone",
    source: "Laelius de Amicitia, 22",
  },
  {
    kind: "quote",
    theme: "famiglia",
    text: "Con la concordia crescono le piccole cose; con la discordia crollano le grandi.",
    author: "Sallustio",
    source: "Bellum Iugurthinum, 10, 6",
  },
  {
    kind: "quote",
    theme: "famiglia",
    text: "Devi vivere per gli altri, se vuoi vivere per te stesso.",
    author: "Seneca",
    source: "Lettere a Lucilio, XLVIII, 2",
  },

  {
    kind: "joke",
    theme: "famiglia",
    text: "La democrazia familiare funziona benissimo: tutti votano, poi qualcuno decide comunque cosa si mangia.",
  },

  // ---------------------------------------------------------------------------
  // FINANZE
  // ---------------------------------------------------------------------------

  {
    kind: "quote",
    theme: "finanze",
    text: "Qual è la giusta misura della ricchezza? Prima avere il necessario, poi ciò che basta.",
    author: "Seneca",
    source: "Lettere a Lucilio, II",
  },
  {
    kind: "quote",
    theme: "finanze",
    text: "Attento alle piccole spese: una piccola falla può affondare una grande nave.",
    author: "Benjamin Franklin",
    source: "The Way to Wealth, 1758",
  },
  {
    kind: "quote",
    theme: "finanze",
    text: "Il costo di una cosa è la quantità di vita che bisogna scambiare per ottenerla.",
    author: "Henry David Thoreau",
    source: "Walden, Economy, 1854",
  },
  {
    kind: "quote",
    theme: "finanze",
    text: "Il vero prezzo di ogni cosa è la fatica necessaria per ottenerla.",
    author: "Adam Smith",
    source: "La ricchezza delle nazioni, libro I, capitolo V, 1776",
  },
  {
    kind: "quote",
    theme: "finanze",
    text: "Ricorda che il tempo è denaro.",
    author: "Benjamin Franklin",
    source: "Advice to a Young Tradesman, 1748",
  },
  {
    kind: "quote",
    theme: "finanze",
    text: "Ricorda che il credito è denaro.",
    author: "Benjamin Franklin",
    source: "Advice to a Young Tradesman, 1748",
  },
  {
    kind: "quote",
    theme: "finanze",
    text: "Il denaro è come il letame: non serve a molto se non viene distribuito.",
    author: "Francis Bacon",
    source: "Essays, Of Seditions and Troubles, 1625",
  },
  {
    kind: "quote",
    theme: "finanze",
    text: "Non essere né debitore né creditore: il prestito spesso fa perdere il denaro e l'amico.",
    author: "William Shakespeare",
    source: "Amleto, atto I, scena III",
  },

  {
    kind: "joke",
    theme: "finanze",
    text: "Il budget domestico è semplice: prima scopri dove vanno i soldi, poi chiediti perché sembrano conoscere la strada meglio di te.",
  },

  // ---------------------------------------------------------------------------
  // CUCINA
  // ---------------------------------------------------------------------------

  {
    kind: "quote",
    theme: "cucina",
    text: "Gli animali si nutrono; l'uomo mangia; solo l'uomo intelligente sa mangiare.",
    author: "Jean Anthelme Brillat-Savarin",
    source: "Fisiologia del gusto, aforisma II, 1825",
  },
  {
    kind: "quote",
    theme: "cucina",
    text: "Il destino delle nazioni dipende dal modo in cui si nutrono.",
    author: "Jean Anthelme Brillat-Savarin",
    source: "Fisiologia del gusto, aforisma III, 1825",
  },
  {
    kind: "quote",
    theme: "cucina",
    text: "Il piacere della tavola appartiene a tutte le età, a tutte le condizioni e a tutti i paesi.",
    author: "Jean Anthelme Brillat-Savarin",
    source: "Fisiologia del gusto, aforisma VII, 1825",
  },
  {
    kind: "quote",
    theme: "cucina",
    text: "La tavola è il solo luogo dove non ci si annoia durante la prima ora.",
    author: "Jean Anthelme Brillat-Savarin",
    source: "Fisiologia del gusto, aforisma VIII, 1825",
  },
  {
    kind: "quote",
    theme: "cucina",
    text: "La scoperta di un nuovo piatto fa per la felicità umana più della scoperta di una nuova stella.",
    author: "Jean Anthelme Brillat-Savarin",
    source: "Fisiologia del gusto, aforisma IX, 1825",
  },
  {
    kind: "quote",
    theme: "cucina",
    text: "Non si può pensare bene, amare bene, dormire bene, se non si è cenato bene.",
    author: "Virginia Woolf",
    source: "Una stanza tutta per sé, capitolo I, 1929",
  },
  {
    kind: "quote",
    theme: "cucina",
    text: "Non c'è amore più sincero dell'amore per il cibo.",
    author: "George Bernard Shaw",
    source: "Man and Superman, 1903",
  },
  {
    kind: "quote",
    theme: "cucina",
    text: "Il miglior condimento che ci sia è la fame.",
    author: "Miguel de Cervantes",
    source: "Don Chisciotte della Mancia",
  },
  {
    kind: "quote",
    theme: "cucina",
    text: "Bisogna mangiare per vivere, e non vivere per mangiare.",
    author: "Molière",
    source: "L'avaro, atto III, scena I, 1668",
  },

  {
    kind: "joke",
    theme: "cucina",
    text: "La ricetta dice: «lascia riposare venti minuti». Finalmente un'istruzione di cucina che vale anche per il cuoco.",
  },

  // ---------------------------------------------------------------------------
  // GUARDAROBA
  // ---------------------------------------------------------------------------

  {
    kind: "quote",
    theme: "guardaroba",
    text: "Diffida di tutte le imprese che richiedono vestiti nuovi.",
    author: "Henry David Thoreau",
    source: "Walden, Economy, 1854",
  },
  {
    kind: "quote",
    theme: "guardaroba",
    text: "Ogni generazione ride delle vecchie mode, ma segue religiosamente quelle nuove.",
    author: "Henry David Thoreau",
    source: "Walden, Economy, 1854",
  },
  {
    kind: "quote",
    theme: "guardaroba",
    text: "Si dovrebbe essere un'opera d'arte, oppure indossarne una.",
    author: "Oscar Wilde",
    source: "Phrases and Philosophies for the Use of the Young, 1894",
  },
  {
    kind: "quote",
    theme: "guardaroba",
    text: "La moda è una forma di bruttezza così intollerabile che dobbiamo cambiarla ogni sei mesi.",
    author: "Oscar Wilde",
    source: "The Philosophy of Dress, 1885",
  },
  {
    kind: "quote",
    theme: "guardaroba",
    text: "Vesti bene quanto ti permette la borsa: ricco, non vistoso.",
    author: "William Shakespeare",
    source: "Amleto, atto I, scena III",
  },
  {
    kind: "quote",
    theme: "guardaroba",
    text: "Un'asola ben fatta è l'unico legame tra l'Arte e la Natura.",
    author: "Oscar Wilde",
    source: "Phrases and Philosophies for the Use of the Young, 1894",
  },
  {
    kind: "quote",
    theme: "guardaroba",
    text: "Chi ha finalmente trovato qualcosa da fare non ha bisogno di un abito nuovo per farlo.",
    author: "Henry David Thoreau",
    source: "Walden, Economy, 1854",
  },

  {
    kind: "joke",
    theme: "guardaroba",
    text: "Ho riordinato l'armadio. Adesso so esattamente dove sono tutti i vestiti che continuo a non mettere.",
  },
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
