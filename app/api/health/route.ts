import { checkSupabaseHealth } from "@/lib/supabase/health";

export async function GET() {
  const supabase = await checkSupabaseHealth();
  const ok = supabase.status === "ok";
  return Response.json(
    { app: "baptista", phase: "04.1", ok, supabase },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
