import type { Metadata } from "next";
import { DeleteAccountPage } from "@/components/account/DeleteAccountPage";

export const metadata: Metadata = {
  title: "Delete Account — Get Vaulted",
  description: "Permanently delete your Get Vaulted account.",
};

export default function Page() {
  return <DeleteAccountPage />;
}
