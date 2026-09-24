/** Delete one of the caller's own "Pulls" media rows + its Storage object. */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveListingsUserId } from "@/lib/resolve-listings-auth";
import {
  deleteListingImageFromSupabase,
  listingImageObjectKeyFromPublicUrl,
} from "@/lib/supabase-listing-storage";

export const runtime = "nodejs";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resolveListingsUserId(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const row = await prisma.profilePullMedia.findUnique({ where: { id } });
  if (!row || row.sellerId !== auth.userId) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Delete the Storage object first — if this fails we keep the row (a visible retry beats
  // an invisible orphan), but a Storage failure alone shouldn't block the DB delete forever,
  // so we only log it rather than aborting.
  const objectKey = listingImageObjectKeyFromPublicUrl(row.url);
  if (objectKey) {
    const removed = await deleteListingImageFromSupabase(objectKey);
    if (!removed.ok) {
      console.warn("[pull-media delete] storage cleanup failed", { id, objectKey, message: removed.message });
    }
  }

  await prisma.profilePullMedia.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
