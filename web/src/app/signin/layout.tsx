import type { Metadata } from "next";
import { NOINDEX_METADATA } from "@/lib/site-seo";

export const metadata: Metadata = {
  title: "Sign in — Get Vaulted",
  description: "Sign in to sell and manage your Get Vaulted listings.",
  ...NOINDEX_METADATA,
};

export default function SignInLayout({ children }: { children: React.ReactNode }) {
  return children;
}
