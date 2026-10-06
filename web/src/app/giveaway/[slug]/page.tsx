import { PublicGiveawayPage } from "@/components/giveaway/PublicGiveawayPage";

export default async function GiveawaySlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <PublicGiveawayPage slug={decodeURIComponent(slug)} />;
}
