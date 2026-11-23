import { prisma } from "@/lib/prisma";

/**
 * Admin "browse lock": the account can still sign in, chat, use its wallet and see its own orders, but it
 * sees no live shows and no marketplace inventory (lists, search, seller shops and direct links all
 * behave as if nothing exists). Pair it with the purchase lock to also stop buying.
 *
 * Fails open: if the lookup throws, the viewer is treated as not locked so a database hiccup never hides
 * the app from ordinary buyers.
 */
export async function isBrowseLockedViewer(userId: string | null | undefined): Promise<boolean> {
  const id = typeof userId === "string" ? userId.trim() : "";
  if (!id) return false;
  try {
    const row = await prisma.user.findUnique({
      where: { id },
      select: { browseLockedAt: true },
    });
    return row?.browseLockedAt != null;
  } catch (e) {
    console.error("[browse-lock] lookup failed — treating viewer as not locked", { userId: id, e });
    return false;
  }
}
