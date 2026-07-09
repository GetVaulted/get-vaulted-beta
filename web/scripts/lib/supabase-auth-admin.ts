/**
 * Supabase Auth admin helpers for wipe scripts (no Prisma / Stripe imports).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export async function listAllAuthUsers(admin: SupabaseClient) {
  const all: { id: string; email: string | undefined }[] = [];
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 500 });
    if (error) throw new Error(error.message);
    const users = data.users ?? [];
    for (const u of users) {
      all.push({ id: u.id, email: u.email });
    }
    if (users.length < 500) break;
    page += 1;
  }
  return all;
}

export async function deleteAllSupabaseAuthUsers(
  admin: SupabaseClient,
  log: (msg: string) => void,
) {
  const users = await listAllAuthUsers(admin);
  log(`  deleting ${users.length} Supabase Auth user(s) …`);
  for (const u of users) {
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error) throw new Error(`deleteUser ${u.email ?? u.id}: ${error.message}`);
  }
  log(`  deleted ${users.length} Auth user(s)`);
}

export async function deleteSupabaseAuthUsersExcept(
  admin: SupabaseClient,
  preserveEmails: ReadonlySet<string>,
  log: (msg: string) => void,
) {
  const users = await listAllAuthUsers(admin);
  const toDelete = users.filter((u) => !preserveEmails.has((u.email ?? "").toLowerCase()));
  const kept = users.length - toDelete.length;
  log(`  deleting ${toDelete.length} Supabase Auth user(s), keeping ${kept} …`);
  for (const u of toDelete) {
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error) throw new Error(`deleteUser ${u.email ?? u.id}: ${error.message}`);
  }
  log(`  deleted ${toDelete.length} Auth user(s), preserved ${kept}`);
}
