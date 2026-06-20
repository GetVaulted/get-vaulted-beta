import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import {
  prismaLiveRoomCreateHint,
  serializePrismaClientError,
  type PrismaClientErrorDTO,
} from "@/lib/prisma-client-error-serialize";

export function isPrismaMissingSchemaError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2021" || err.code === "P2022") return true;
    const msg = `${err.message}\n${JSON.stringify(err.meta ?? {})}`;
    if (err.code === "P2010" && /(42703|does not exist|ColumnNotFound)/i.test(msg)) return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /P2021|P2022/i.test(msg) ||
    /column\s+.+\s+does not exist/i.test(msg) ||
    /relation\s+.+\s+does not exist/i.test(msg) ||
    /42703/.test(msg)
  );
}

export function prismaSchemaErrorUserMessage(pe: PrismaClientErrorDTO): string {
  if (pe.code === "P2022" || /column/i.test(pe.message)) {
    return "Database schema is out of date for this deployment. Redeploy the latest web build or run prisma migrate deploy on the beta database.";
  }
  if (pe.code === "P2021" || /relation/i.test(pe.message)) {
    return "Database is missing required tables. Run prisma migrate deploy on the beta database.";
  }
  return "Database schema error. Contact support if this persists.";
}

export function apiErrorResponseFromUnknown(
  err: unknown,
  fallback: { error: string; code: string; status?: number },
): NextResponse {
  const prismaDto = serializePrismaClientError(err);
  const hint = prismaLiveRoomCreateHint(prismaDto);
  const schemaOutOfDate = isPrismaMissingSchemaError(err);
  const status = schemaOutOfDate ? 503 : (fallback.status ?? 500);
  const error = schemaOutOfDate ? prismaSchemaErrorUserMessage(prismaDto) : fallback.error;
  return NextResponse.json(
    {
      error,
      code: schemaOutOfDate ? "DATABASE_SCHEMA_OUT_OF_DATE" : fallback.code,
      detail: prismaDto.message,
      hint,
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
