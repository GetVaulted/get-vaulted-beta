import { AdminListingsPage } from "@/components/admin/AdminListingsPage";

type SearchParams = Promise<{
  status?: string | string[];
  channel?: string | string[];
  page?: string | string[];
}>;

function first(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  return (
    <AdminListingsPage
      initialStatus={first(sp.status)}
      initialChannel={first(sp.channel)}
      initialPage={first(sp.page)}
    />
  );
}
