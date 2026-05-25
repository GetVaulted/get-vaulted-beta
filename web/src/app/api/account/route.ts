import { NextResponse } from "next/server";
import { deleteUserAccount, getAccountDeletionBlockers } from "@/lib/account-deletion";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";

export async function GET(req: Request) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  const blockers = await getAccountDeletionBlockers(auth.userId);
  return NextResponse.json({ blockers });
}

export async function DELETE(req: Request) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  const result = await deleteUserAccount(auth.userId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
