export function offerStatusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "accepted":
      return "Accepted";
    case "declined":
      return "Declined";
    case "countered":
      return "Countered";
    default:
      return status;
  }
}

export function offerStatusTone(status: string): string {
  if (status === "accepted") return "border-emerald-400/25 bg-emerald-500/10 text-emerald-200/95";
  if (status === "declined") return "border-zinc-500/25 bg-zinc-800/40 text-zinc-400";
  if (status === "countered") return "border-amber-400/25 bg-amber-950/30 text-amber-100/90";
  return "border-sky-400/25 bg-sky-950/30 text-sky-100/90";
}
