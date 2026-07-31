import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  for (const id of ["cms1yaygj002509jxf0yn1pxb", "cmrsol3vy000h09l7rs2nomsb"]) {
    const o = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        itemPriceUsd: true,
        shippingPriceUsd: true,
        totalUsd: true,
        shippingLabelCostCents: true,
        shippingLabelCostReversedCents: true,
        stripeTransferId: true,
        shippingStatus: true,
        seller: { select: { username: true } },
        labelFinances: {
          select: {
            status: true,
            purpose: true,
            labelCostCents: true,
            sellerClawbackCents: true,
            sellerClawbackReversalId: true,
            clawbackFailureDetail: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    console.log(JSON.stringify(o, null, 2));
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
