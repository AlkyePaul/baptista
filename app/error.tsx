"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Never render error messages: they may contain configuration or database details.
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-5">
      <h1 className="text-2xl font-semibold">Qualcosa è andato storto</h1>
      <p className="text-muted">Non è stato possibile caricare la pagina. Riprova tra poco.</p>
      <button
        type="button"
        onClick={reset}
        className="min-h-12 rounded-xl bg-foreground px-5 font-medium text-background"
      >
        Riprova
      </button>
    </main>
  );
}
