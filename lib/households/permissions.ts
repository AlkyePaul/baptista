import { z } from "zod";

/**
 * Visibility accepted from clients. `selected_members` is reserved and rejected until its ACL
 * exists (decision D05); the database CHECK constraints enforce the same rule.
 */
export const visibilitySchema = z.enum(["household", "private"], {
  error: "Scegli chi può vedere questo elemento.",
});

export const VISIBILITY_LABELS = {
  household: "Tutta la casa",
  private: "Solo io",
} as const;

export const uuidSchema = z.uuid({ error: "Identificativo non valido." });
