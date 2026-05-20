import { NextResponse } from "next/server";
import { supabaseProjectRefFromUrl } from "@/lib/resolve-database-url";

/**
 * Public read-only check that beta web Supabase env is present and which project ref it targets.
 * Does not expose keys. Compare `projectRef` to mobile `EXPO_PUBLIC_SUPABASE_URL`.
 */
export async function GET() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? process.env.SUPABASE_URL?.trim() ?? "";
  const anonConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? process.env.SUPABASE_ANON_KEY?.trim(),
  );
  const projectRef = url ? supabaseProjectRefFromUrl(url) : null;

  return NextResponse.json({
    projectRef,
    supabaseUrlConfigured: Boolean(url),
    supabaseAnonKeyConfigured: anonConfigured,
    webSignInSupportsSupabaseAuth: anonConfigured && Boolean(url),
    expectedBetaProjectRef: "xkaaicokjgmpbctfermj",
    alignedWithBeta: projectRef === "xkaaicokjgmpbctfermj",
  });
}
