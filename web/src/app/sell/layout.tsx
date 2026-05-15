import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sell — Get Vaulted",
  description: "Create a marketplace listing on Get Vaulted.",
};

export default function SellLayout({ children }: { children: React.ReactNode }) {
  return children;
}
