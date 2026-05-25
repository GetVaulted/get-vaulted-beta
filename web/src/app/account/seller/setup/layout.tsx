import { SellerSetupOnboardingChrome } from "@/components/account/sellerSetup/SellerSetupOnboardingChrome";

export default function SellerSetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SellerSetupOnboardingChrome />
      {children}
    </>
  );
}
