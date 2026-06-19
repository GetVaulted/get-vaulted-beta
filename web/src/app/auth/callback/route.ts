import { type NextRequest } from "next/server";
import { completeOAuthCallback } from "@/lib/complete-oauth-callback";
import { readOAuthReturnTo } from "@/lib/supabase-server-auth-client";

export async function GET(request: NextRequest) {
  return completeOAuthCallback(request, readOAuthReturnTo(request));
}
