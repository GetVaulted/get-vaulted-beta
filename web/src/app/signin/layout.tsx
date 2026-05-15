import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in — Get Vaulted",
  description: "Sign in to sell and manage your Get Vaulted listings.",
};

export default function SignInLayout({ children }: { children: React.ReactNode }) {
  return children;
}
