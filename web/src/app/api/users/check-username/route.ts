import { NextResponse } from "next/server";
import { isDevTempNoDatabaseMode } from "@/lib/dev-temp-no-db";
import { prisma } from "@/lib/prisma";
import { evaluateUsernamePolicy, normalizeUsernameForStorage } from "@/lib/username-policy";
import { isUsernameTakenCaseInsensitive } from "@/lib/username-db";
import type { UsernameRejectReason } from "@/lib/username-policy";

export const runtime = "nodejs";

/** Strip obvious credentials from Prisma/pg errors before echoing to the browser in dev. */
function redactConnectionStrings(message: string): string {
  return message.replace(/(postgres(ql)?:\/\/)[^\s@]+@/gi, "$1***@");
}

type CheckJson = {
  available: boolean;
  reason?: UsernameRejectReason;
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get("username") ?? "";
    const normalized = normalizeUsernameForStorage(raw);

    if (normalized.length === 0) {
      return NextResponse.json({ available: false, reason: "invalid" } satisfies CheckJson);
    }

    const policy = evaluateUsernamePolicy(normalized);
    if (!policy.ok) {
      return NextResponse.json({ available: false, reason: policy.reason } satisfies CheckJson);
    }

    if (isDevTempNoDatabaseMode()) {
      return NextResponse.json({ available: true } satisfies CheckJson);
    }

    const taken = await isUsernameTakenCaseInsensitive(prisma, normalized);
    if (taken) {
      return NextResponse.json({ available: false, reason: "taken" } satisfies CheckJson);
    }

    return NextResponse.json({ available: true } satisfies CheckJson);
  } catch (err) {
    console.error("[check-username]", err);
    const allowClientHint = process.env.NODE_ENV === "development";
    const debugMessage =
      allowClientHint && err instanceof Error
        ? redactConnectionStrings(err.message).slice(0, 400)
        : undefined;
    return NextResponse.json(
      {
        error: "Could not check username. Try again.",
        ...(debugMessage ? { debugMessage } : {}),
      },
      { status: 503 },
    );
  }
}
