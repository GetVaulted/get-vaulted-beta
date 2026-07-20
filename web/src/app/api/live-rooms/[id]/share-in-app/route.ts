import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { shareLiveRoomInApp } from "@/services/live-room-in-app-share";

type PostBody = {
  recipientUserIds?: string[];
  notifyFollowers?: boolean;
  note?: string;
};

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const recipientUserIds = Array.isArray(body.recipientUserIds)
    ? body.recipientUserIds.filter((id): id is string => typeof id === "string")
    : undefined;
  const notifyFollowers = body.notifyFollowers === true;

  if (!notifyFollowers && (!recipientUserIds || recipientUserIds.length === 0)) {
    return NextResponse.json({ error: "Pick someone to share with or notify followers." }, { status: 400 });
  }

  try {
    const result = await shareLiveRoomInApp({
      senderId: auth.userId,
      liveRoomId,
      recipientUserIds,
      notifyFollowers,
      note: typeof body.note === "string" ? body.note : undefined,
    });
    return NextResponse.json(result);
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    if (code === "NOT_FOUND") return NextResponse.json({ error: "Live show not found." }, { status: 404 });
    if (code === "NOT_HOST") {
      return NextResponse.json({ error: "Only the host can notify all followers." }, { status: 403 });
    }
    if (code === "PRIVATE_NO_FOLLOWER_BLAST") {
      return NextResponse.json(
        { error: "Private shows are invite-only. Share with specific people instead of all followers." },
        { status: 400 },
      );
    }
    console.error("[share-in-app]", e);
    return NextResponse.json({ error: "Could not share in app." }, { status: 500 });
  }
}
