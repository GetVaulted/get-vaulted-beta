import { prisma } from "@/lib/prisma";
import { verifyVenmoSetupState } from "@/lib/paypal-buyer-venmo";
import { getPayPalUserIdToken, paypalCredentialsConfigured } from "@/lib/paypal-auth";
import { VenmoConnectButton } from "@/components/account/VenmoConnectButton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-6 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-950 p-8 text-center shadow-xl">
        {children}
      </div>
    </div>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <Shell>
      <p className="text-base font-semibold text-zinc-100">{title}</p>
      <p className="mt-2 text-sm text-zinc-400">{body}</p>
    </Shell>
  );
}

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? "";
  return value?.trim() ?? "";
}

export default async function VenmoConnectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const uid = firstParam(sp.uid);
  const nonce = firstParam(sp.nonce);
  const sig = firstParam(sp.sig);
  const mobile = firstParam(sp.mobile) === "1";

  if (!uid || !nonce || !sig || !verifyVenmoSetupState({ userId: uid, nonce, sig })) {
    return (
      <Message
        title="Link expired"
        body="This Venmo connect link is invalid or expired. Go back and tap Connect Venmo again."
      />
    );
  }

  if (!paypalCredentialsConfigured()) {
    return <Message title="Venmo unavailable" body="Venmo isn't configured right now. Try again later." />;
  }

  const user = await prisma.user.findUnique({
    where: { id: uid },
    select: {
      venmoPendingSetupTokenId: true,
      venmoPendingSetupNonce: true,
      paypalBuyerCustomerId: true,
    },
  });

  if (!user?.venmoPendingSetupTokenId?.trim() || user.venmoPendingSetupNonce?.trim() !== nonce) {
    return (
      <Message
        title="Link expired"
        body="This Venmo connect session has expired. Go back and tap Connect Venmo again."
      />
    );
  }

  const orderId = user.venmoPendingSetupTokenId.trim();
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim() ?? "";

  let idToken: string;
  try {
    idToken = await getPayPalUserIdToken(user.paypalBuyerCustomerId);
  } catch (e) {
    console.error("[venmo-connect] id token", e);
    return (
      <Message title="Venmo unavailable" body="Could not start Venmo securely. Try again in a moment." />
    );
  }

  const statePart = `uid=${encodeURIComponent(uid)}&nonce=${encodeURIComponent(nonce)}&sig=${encodeURIComponent(sig)}${
    mobile ? "&mobile=1" : ""
  }`;
  const approveUrl = `/api/account/payment-methods/venmo-callback?${statePart}`;
  const cancelUrl = mobile ? "getvaulted://wallet?venmo=cancelled" : "/account/payment-methods?venmo=cancelled";
  const errorUrl = mobile
    ? "getvaulted://wallet?venmo=error&reason=js_sdk_error"
    : "/account/payment-methods?venmo=error&reason=js_sdk_error";

  return (
    <Shell>
      <p className="text-base font-semibold text-zinc-100">Connect Venmo</p>
      <p className="mt-2 text-sm text-zinc-400">
        Tap below — you&apos;ll switch to the Venmo app to approve, then come right back.
      </p>
      <div className="mt-6">
        <VenmoConnectButton
          clientId={clientId}
          idToken={idToken}
          orderId={orderId}
          approveUrl={approveUrl}
          cancelUrl={cancelUrl}
          errorUrl={errorUrl}
        />
      </div>
    </Shell>
  );
}
