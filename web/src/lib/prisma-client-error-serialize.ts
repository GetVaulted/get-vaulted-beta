import { Prisma } from "@/generated/prisma/client";

/** JSON-safe Prisma / Error fields for API responses and logs (no connection strings). */
export type PrismaClientErrorDTO = {
  name: string;
  message: string;
  code?: string;
  meta?: unknown;
};

export function serializePrismaClientError(err: unknown): PrismaClientErrorDTO {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return {
      name: err.name,
      code: err.code,
      message: err.message,
      meta: err.meta,
    };
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    return { name: err.name, message: err.message };
  }
  if (err instanceof Prisma.PrismaClientUnknownRequestError) {
    return { name: err.name, message: err.message };
  }
  if (err instanceof Prisma.PrismaClientRustPanicError) {
    return { name: err.name, message: err.message };
  }
  if (err instanceof Prisma.PrismaClientInitializationError) {
    return { name: err.name, message: err.message };
  }
  if (err instanceof Error) {
    return { name: err.name, message: err.message };
  }
  return { name: "Unknown", message: String(err) };
}

export function prismaLiveRoomCreateHint(pe: PrismaClientErrorDTO): string | undefined {
  const c = pe.code;
  if (c === "P2003") {
    return "Foreign key failed (P2003). Often the signed-in user id is missing from the User table in this DATABASE_URL, or a related row is missing. Run: select id, email from \"User\" where id = '<your session user id>';";
  }
  if (c === "P2021") {
    return "Table missing (P2021). Apply migrations on this database: npx prisma migrate deploy";
  }
  if (c === "P2022") {
    return "Column missing (P2022). Regenerate the client and align migrations: npx prisma generate && npx prisma migrate deploy";
  }
  if (c === "P2002") {
    return "Unique constraint violated (P2002). See meta.target for fields.";
  }
  return undefined;
}

export function prismaListingCreateHint(pe: PrismaClientErrorDTO): string | undefined {
  const c = pe.code;
  if (c === "P2003") {
    return "Foreign key failed (P2003). The signed-in user may be missing from the User table — sign out and back in, or complete account setup on web.";
  }
  if (c === "P2021") {
    return "Table missing (P2021). Run npx prisma migrate deploy on the beta database.";
  }
  if (c === "P2022") {
    return "Column missing (P2022). Deploy latest web migrations: npx prisma migrate deploy";
  }
  return prismaLiveRoomCreateHint(pe);
}
