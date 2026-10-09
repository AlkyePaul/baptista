/** Result returned by Server Actions to forms. Messages are Italian and never contain raw DB text. */
export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
};

export const initialActionState: ActionState = { ok: false };

export class DomainError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "DomainError";
    this.code = code;
  }
}

const MESSAGES: Record<string, string> = {
  not_authenticated: "La sessione è scaduta. Accedi di nuovo.",
  forbidden: "Non hai i permessi per questa operazione.",
  forbidden_visibility_change: "Solo chi ha creato l'elemento può cambiarne la visibilità.",
  not_found: "Elemento non trovato o non più disponibile.",
  conflict: "Qualcun altro ha modificato questo elemento. Ricarica la pagina e riprova.",
  invite_unavailable:
    "Non è possibile invitare questo indirizzo. La persona deve avere già un account Baptista e non far parte della casa.",
  last_owner: "La casa deve avere almeno un proprietario. Trasferisci prima la proprietà.",
  profile_required: "Completa prima il tuo profilo.",
  invalid_timezone: "Fuso orario non valido.",
  future_entry: "Non puoi registrare un giorno futuro.",
  duplicate: "Questo elemento è già stato registrato.",
  invalid: "Alcuni valori non sono validi.",
  no_household: "Seleziona una casa.",
  category_unavailable: "Puoi usare solo le categorie di sistema o quelle create da te.",
  category_exists: "Hai già una categoria con questo nome.",
  limit_reached: "Hai raggiunto il numero massimo di elementi.",
  lookup_unavailable: "Open Food Facts non risponde. Riprova tra poco o inserisci i valori a mano.",
};

export function messageFor(code: string): string {
  return MESSAGES[code] ?? "Qualcosa è andato storto. Riprova.";
}

type PgLikeError = { code?: string; message?: string } | null | undefined;

/** Maps Supabase/PostgREST/Postgres errors to a stable domain code. */
export function codeFromDbError(error: PgLikeError): string {
  if (!error) return "unknown";
  const message = error.message ?? "";
  for (const code of Object.keys(MESSAGES)) {
    if (message === code || message.startsWith(`${code}`)) return code;
  }
  switch (error.code) {
    case "23505":
      return "duplicate";
    case "23514":
    case "22023":
    case "22P02":
    case "22007":
    case "22008":
      return "invalid";
    case "42501":
      return "forbidden";
    case "40001":
      return "conflict";
    case "P0002":
    case "PGRST116":
      return "not_found";
    default:
      return "unknown";
  }
}

export function throwIfDbError(error: PgLikeError): void {
  if (!error) return;
  const code = codeFromDbError(error);
  if (code === "unknown") {
    // Only the technical code (e.g. PGRST200, 42P01): messages may contain user data.
    console.error("[baptista] unmapped database error", error.code ?? "no-code");
  }
  throw new DomainError(code);
}

/** Converts any thrown error into a form-friendly state without leaking internals. */
export function toActionState(error: unknown): ActionState {
  if (error instanceof DomainError) return { ok: false, message: messageFor(error.code) };
  if (isRedirectLike(error)) throw error;
  console.error("[baptista] unexpected action error", error instanceof Error ? error.name : typeof error);
  return { ok: false, message: messageFor("unknown") };
}

function isRedirectLike(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR"));
}
