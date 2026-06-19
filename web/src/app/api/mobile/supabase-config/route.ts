import { NextResponse } from "next/server";
import { supabaseProjectRefFromUrl } from "@/lib/resolve-database-url";

/**
 * Public mobile bootstrap — returns the same publishable Supabase credentials the web app uses.
 * Safe to expose: anon/publishable keys are client-side by design.
 */
export async function GET() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? process.env.SUPABASE_URL?.trim() ?? "";
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ??
    process.env.SUPABASE_ANON_KEY?.trim() ??
    "";

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "Supabase is not configured on this deployment." }, { status: 503 });
  }

  return NextResponse.json({
    supabaseUrl,
    supabaseAnonKey,
    projectRef: supabaseProjectRefFromUrl(supabaseUrl),
  });
}
