import type { Metadata } from "next";
import { signOut } from "@/app/actions/auth";
import { buttonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Accesso non abilitato" };

/** Signed-in account that is not (or no longer) listed in baptista.app_users (D33). */
export default async function AccessDeniedPage() {
  const user = await requireUser();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-5 pt-[max(env(safe-area-inset-top),2rem)] pb-[max(env(safe-area-inset-bottom),2rem)]">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium tracking-wide text-muted uppercase">Baptista</p>
        <h1 className="text-3xl font-semibold tracking-tight">Account non abilitato</h1>
        <p className="text-muted">
          L&apos;account <span className="font-medium text-foreground">{user.email}</span> non è abilitato a Baptista. Chiedi a
          chi gestisce la casa di aggiungerti.
        </p>
      </header>
      <form action={signOut}>
        <button type="submit" className={buttonClass.secondary}>
          Esci e usa un&apos;altra email
        </button>
      </form>
    </main>
  );
}
