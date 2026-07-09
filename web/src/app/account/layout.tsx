import type { Metadata } from "next";
import { NOINDEX_METADATA } from "@/lib/site-seo";

export const metadata: Metadata = NOINDEX_METADATA;

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return children;
}
