import { AccountSellerOrderDetailPage } from "@/components/account/AccountSellerOrderDetailPage";

export const dynamic = "force-dynamic";

export default async function SellerOrderDetailRoute({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId: raw } = await params;
  const orderId = decodeURIComponent(raw);
  return <AccountSellerOrderDetailPage orderId={orderId} />;
}
