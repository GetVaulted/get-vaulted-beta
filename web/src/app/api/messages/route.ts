import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

type Body = {
  listingId?: string;
  body?: unknown;
};

function trimBody(s: unknown, max = 8000): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim().slice(0, max);
  return t.length ? t : null;
}

export async function POST(req: Request) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to message the seller." }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const listingId = typeof body.listingId === "string" ? body.listingId.trim() : "";
  const text = trimBody(body.body, 8000);
  if (!listingId) return NextResponse.json({ error: "Missing listing." }, { status: 400 });
  if (!text) return NextResponse.json({ error: "Enter a message." }, { status: 400 });

  const buyerId = session.user.id;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const listing = await tx.listing.findUnique({
        where: { id: listingId },
        select: { id: true, title: true, sellerId: true, status: true, moderationRemovedAt: true },
      });
      if (!listing) {
        throw new Error("NOT_FOUND");
      }
      if (listing.sellerId === buyerId) {
        throw new Error("SELF");
      }
      if (listing.moderationRemovedAt) {
        throw new Error("NOT_PUBLIC");
      }
      if (listing.status !== "active" && listing.status !== "auction_live") {
        throw new Error("NOT_PUBLIC");
      }

      const thread = await tx.messageThread.upsert({
        where: {
          buyerId_sellerId_listingId: {
            buyerId,
            sellerId: listing.sellerId,
            listingId: listing.id,
          },
        },
        create: {
          buyerId,
          sellerId: listing.sellerId,
          listingId: listing.id,
        },
        update: {
          updatedAt: new Date(),
        },
      });

      await tx.message.create({
        data: {
          threadId: thread.id,
          senderId: buyerId,
          recipientId: listing.sellerId,
          listingId: listing.id,
          body: text,
        },
      });

      await tx.messageThread.update({
        where: { id: thread.id },
        data: { updatedAt: new Date() },
      });

      const preview = text.length > 120 ? `${text.slice(0, 117)}…` : text;
      const lt = listing.title.length > 60 ? `${listing.title.slice(0, 57)}…` : listing.title;
      await createNotification(tx, {
        userId: listing.sellerId,
        type: "message_received",
        title: "New message",
        body: `Regarding “${lt}”: ${preview}`,
        href: `/account/messages/${encodeURIComponent(thread.id)}`,
      });

      return { threadId: thread.id };
    });

    return NextResponse.json(result);
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    if (code === "NOT_FOUND") return NextResponse.json({ error: "Listing not found." }, { status: 404 });
    if (code === "SELF") return NextResponse.json({ error: "You cannot message yourself." }, { status: 400 });
    if (code === "NOT_PUBLIC") return NextResponse.json({ error: "This listing is not available." }, { status: 409 });
    console.error(e);
    return NextResponse.json({ error: "Could not send message." }, { status: 500 });
  }
}
