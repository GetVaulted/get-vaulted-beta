import type { Metadata } from "next";
import { DeleteAccountPage } from "@/components/account/DeleteAccountPage";

export const metadata: Metadata = {
  title: "Account Deletion — Get Vaulted",
  description: "How to permanently delete your Get Vaulted account on web or mobile.",
};

/** Public URL for App Store / Play account-deletion disclosure. */
export default function Page() {
  return <DeleteAccountPage />;
}
