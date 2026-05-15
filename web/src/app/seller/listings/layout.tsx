import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Listings — Get Vaulted",
  description: "Manage your Get Vaulted marketplace listings.",
};

export default function SellerListingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
