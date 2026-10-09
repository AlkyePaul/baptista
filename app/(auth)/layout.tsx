export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-5 pt-[max(env(safe-area-inset-top),2rem)] pb-[max(env(safe-area-inset-bottom),2rem)]">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium tracking-wide text-muted uppercase">Baptista</p>
        <p className="text-muted">Il sistema operativo privato della tua casa.</p>
      </div>
      {children}
    </main>
  );
}
