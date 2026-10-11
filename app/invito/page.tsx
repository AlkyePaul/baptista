import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { claimInvitationAction } from "@/app/actions/households";
import { ActionForm, Field, SubmitButton } from "@/components/forms";
import { buttonClass, Card } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Invito" };

/** Entry for signed-in accounts without a Baptista profile: Baptista is invite-only. */
export default async function InvitePage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("user_id").eq("user_id", user.id).maybeSingle();
  if (profile) redirect("/");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-5 pt-[max(env(safe-area-inset-top),2rem)] pb-[max(env(safe-area-inset-bottom),2rem)]">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium tracking-wide text-muted uppercase">Baptista</p>
        <h1 className="text-3xl font-semibold tracking-tight">Baptista è solo su invito</h1>
        <p className="text-muted">
          Inserisci il codice che ti ha mandato chi ti ha invitato. Il codice vale solo per l&apos;email{" "}
          <span className="font-medium text-foreground">{user.email}</span>.
        </p>
      </header>

      <Card className="p-4">
        <ActionForm action={claimInvitationAction}>
          <Field
            label="Codice invito"
            name="code"
            autoComplete="one-time-code"
            placeholder="ABCD-EFGH"
            required
          />
          <SubmitButton pendingLabel="Verifica…">Entra</SubmitButton>
        </ActionForm>
      </Card>

      <form action={signOut}>
        <button type="submit" className={buttonClass.ghost}>
          Esci e usa un&apos;altra email
        </button>
      </form>
    </main>
  );
}
