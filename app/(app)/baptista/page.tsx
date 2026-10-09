import type { Metadata } from "next";
import { Card, PageHeader, TextLink } from "@/components/ui";

export const metadata: Metadata = { title: "Assistente" };

export default function AssistantPage() {
  return (
    <>
      <PageHeader title="Baptista" subtitle="L'assistente della tua casa" />
      <Card className="flex flex-col gap-3 p-5">
        <p>L&apos;assistente arriverà presto.</p>
        <p className="text-muted">
          Intanto Baptista funziona già senza intelligenza artificiale: calendario, liste, abitudini e obiettivi sono
          calcolati in modo esatto, e la Home ti mostra ogni giorno le situazioni più importanti.
        </p>
        <TextLink href="/">Torna alla Home</TextLink>
      </Card>
    </>
  );
}
