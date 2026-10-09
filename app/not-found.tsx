import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-5">
      <h1 className="text-2xl font-semibold">Pagina non trovata</h1>
      <p className="text-muted">L&apos;elemento non esiste più oppure non hai accesso.</p>
      <Link href="/" className="min-h-12 content-center rounded-xl bg-foreground px-5 text-center font-medium text-background">
        Torna alla Home
      </Link>
    </main>
  );
}
