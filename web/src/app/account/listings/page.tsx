import { redirect } from "next/navigation";

/** Seller inventory index — canonical Seller Studio listings hub. */
export default function AccountListingsRedirectPage() {
  redirect("/seller/listings");
}
