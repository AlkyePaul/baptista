import "server-only";

import { revalidatePath } from "next/cache";
import { toActionState, type ActionState } from "@/lib/errors";

/**
 * Runs a mutation and refetches every view after success (no client cache of domain data).
 * Errors become Italian messages; redirects pass through.
 */
export async function run(mutation: () => Promise<unknown>, successMessage?: string): Promise<ActionState> {
  try {
    await mutation();
  } catch (error) {
    return toActionState(error);
  }
  revalidatePath("/", "layout");
  return { ok: true, message: successMessage };
}
