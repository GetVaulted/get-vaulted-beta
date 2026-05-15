import Link from "next/link";

const cards = [
  {
    href: "/admin/listings",
    title: "Listings",
    body: "Review marketplace listings, remove or restore, mark reviewed.",
  },
  {
    href: "/admin/users",
    title: "Users",
    body: "Search accounts, suspend or unsuspend users.",
  },
  {
    href: "/admin/orders",
    title: "Orders",
    body: "Inspect orders by status and open detail views.",
  },
] as const;

export default function AdminHomePage() {
  return (
    <main className="mx-auto w-full max-w-[1920px] px-3 py-10 sm:px-4 lg:px-10">
      <h1 className="font-display text-2xl font-black tracking-tight text-foreground">Operations</h1>
      <p className="mt-2 max-w-xl text-sm text-zinc-500">Basic moderation and visibility controls for the marketplace.</p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <li key={c.href}>
            <Link
              href={c.href}
              className="block h-full rounded-xl border border-white/[0.08] bg-[#0a0a0d]/90 p-5 transition hover:border-gold/25 hover:bg-white/[0.02]"
            >
              <h2 className="text-sm font-bold text-gold-bright">{c.title}</h2>
              <p className="mt-2 text-xs leading-relaxed text-zinc-500">{c.body}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
