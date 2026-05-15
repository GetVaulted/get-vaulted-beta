import { getTradeDemoPartnerUserId } from '../lib/devTools';
import { getNetlifyFunctionsBase } from '../lib/netlifyFunctions';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';

export type QaSetupStatus = 'ready' | 'missing' | 'needs_setup' | 'test_failed';

export type QaSetupCheckKey =
  | 'supabase_url'
  | 'supabase_anon'
  | 'netlify_base'
  | 'signed_in'
  | 'demo_partner_env'
  | 'my_live_listing'
  | 'partner_live_listing'
  | 'qa_rpc'
  | 'realtime'
  | 'stripe_checkout'
  | 'runner_error';

export type QaSetupCheckResult = {
  key: QaSetupCheckKey;
  title: string;
  status: QaSetupStatus;
  detail?: string;
};

function row(
  key: QaSetupCheckKey,
  title: string,
  status: QaSetupStatus,
  detail?: string,
): QaSetupCheckResult {
  return { key, title, status, detail };
}

function envSet(v: string | undefined): boolean {
  return Boolean(v?.trim());
}

async function hasLiveListingForSeller(sb: NonNullable<ReturnType<typeof getSupabase>>, sellerId: string): Promise<boolean> {
  const { count, error } = await sb
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .eq('seller_id', sellerId)
    .eq('status', 'live');
  if (error) return false;
  return (count ?? 0) > 0;
}

async function probeQaRpc(sb: NonNullable<ReturnType<typeof getSupabase>>): Promise<QaSetupCheckResult> {
  const fakeId = '00000000-0000-4000-8000-000000000001';
  const { error } = await sb.rpc('qa_upsert_mock_shipping_labels', { p_trade_id: fakeId });
  if (!error) {
    return row('qa_rpc', 'QA RPC migration available', 'ready');
  }
  const msg = error.message ?? '';
  if (/function|does not exist|schema cache|42883|not find the function/i.test(msg)) {
    return row('qa_rpc', 'QA RPC migration available', 'missing', msg.slice(0, 160));
  }
  if (/Trade not found|trade not found/i.test(msg)) {
    return row('qa_rpc', 'QA RPC migration available', 'ready');
  }
  return row('qa_rpc', 'QA RPC migration available', 'test_failed', msg.slice(0, 160));
}

function probeRealtime(sb: NonNullable<ReturnType<typeof getSupabase>>, userId: string): Promise<QaSetupCheckResult> {
  return new Promise((resolve) => {
    let settled = false;
    const ch = sb.channel(`qa-rt-probe-${Date.now()}`).on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'trade_offers', filter: `sender_id=eq.${userId}` },
      () => {},
    );

    const finish = (r: QaSetupCheckResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        sb.removeChannel(ch);
      } catch {
        /* ignore */
      }
      resolve(r);
    };

    const timer = setTimeout(() => {
      finish(
        row(
          'realtime',
          'Realtime enabled for trade_offers',
          'needs_setup',
          'Subscription did not reach SUBSCRIBED in time — enable Realtime for public.trade_offers in Supabase.',
        ),
      );
    }, 4500);

    ch.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        finish(row('realtime', 'Realtime enabled for trade_offers', 'ready'));
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        finish(
          row(
            'realtime',
            'Realtime enabled for trade_offers',
            'test_failed',
            err?.message ?? `Channel status: ${status}`,
          ),
        );
      }
    });
  });
}

async function probeStripeCheckout(): Promise<QaSetupCheckResult> {
  const base = getNetlifyFunctionsBase();
  if (!base) {
    return row('stripe_checkout', 'Stripe test checkout reachable', 'missing', 'EXPO_PUBLIC_NETLIFY_FUNCTIONS_BASE not set');
  }
  const url = `${base}/trade-fee-checkout`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tradeOfferId: '00000000-0000-4000-8000-000000000002',
        userId: '00000000-0000-4000-8000-000000000003',
        amountCents: 100,
      }),
    });
    const text = await res.text();
    if (res.ok) {
      try {
        const j = JSON.parse(text) as { url?: string };
        if (j?.url) {
          return row('stripe_checkout', 'Stripe test checkout reachable', 'ready');
        }
        return row('stripe_checkout', 'Stripe test checkout reachable', 'needs_setup', '200 but no checkout url in body');
      } catch {
        return row('stripe_checkout', 'Stripe test checkout reachable', 'needs_setup', '200 but invalid JSON');
      }
    }
    return row(
      'stripe_checkout',
      'Stripe test checkout reachable',
      'needs_setup',
      `HTTP ${res.status}: ${text.slice(0, 120)}`,
    );
  } catch (e) {
    return row(
      'stripe_checkout',
      'Stripe test checkout reachable',
      'test_failed',
      e instanceof Error ? e.message : 'Network error',
    );
  }
}

/**
 * Runs all Trade Center QA setup probes (network + Supabase). Safe to call often.
 */
export async function runTradeQaSetupChecks(userId: string | null): Promise<QaSetupCheckResult[]> {
  const out: QaSetupCheckResult[] = [];

  const urlOk = envSet(process.env.EXPO_PUBLIC_SUPABASE_URL);
  const keyOk = envSet(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
  const netlifyOk = envSet(process.env.EXPO_PUBLIC_NETLIFY_FUNCTIONS_BASE);

  out.push(
    row(
      'supabase_url',
      'Supabase URL configured',
      urlOk ? 'ready' : 'missing',
      urlOk ? undefined : 'Set EXPO_PUBLIC_SUPABASE_URL',
    ),
  );
  out.push(
    row(
      'supabase_anon',
      'Supabase anon key configured',
      keyOk ? 'ready' : 'missing',
      keyOk ? undefined : 'Set EXPO_PUBLIC_SUPABASE_ANON_KEY',
    ),
  );
  out.push(
    row(
      'netlify_base',
      'Netlify functions base configured',
      netlifyOk ? 'ready' : 'missing',
      netlifyOk ? undefined : 'Set EXPO_PUBLIC_NETLIFY_FUNCTIONS_BASE',
    ),
  );

  const signed = Boolean(userId);
  out.push(
    row(
      'signed_in',
      'Current user signed in',
      signed ? 'ready' : 'missing',
      signed ? undefined : 'Sign in from Trade Center home',
    ),
  );

  const demo = getTradeDemoPartnerUserId();
  out.push(
    row(
      'demo_partner_env',
      'Demo partner user id configured',
      demo ? 'ready' : 'missing',
      demo ? undefined : 'Set EXPO_PUBLIC_TRADE_DEMO_PARTNER_USER_ID',
    ),
  );

  if (!urlOk || !keyOk || !isSupabaseConfigured()) {
    out.push(
      row(
        'my_live_listing',
        'Current user has at least one live listing',
        'needs_setup',
        'Configure Supabase env first',
      ),
    );
    out.push(
      row(
        'partner_live_listing',
        'Demo partner has at least one live listing',
        demo ? 'needs_setup' : 'missing',
        demo ? 'Configure Supabase env first' : 'Set demo partner id first',
      ),
    );
    out.push(row('qa_rpc', 'QA RPC migration available', 'needs_setup', 'Configure Supabase env first'));
    out.push(row('realtime', 'Realtime enabled for trade_offers', 'needs_setup', 'Configure Supabase env first'));
    out.push(await probeStripeCheckout());
    return out;
  }

  const sb = getSupabase();
  if (!sb) {
    out.push(row('my_live_listing', 'Current user has at least one live listing', 'test_failed', 'No Supabase client'));
    out.push(row('partner_live_listing', 'Demo partner has at least one live listing', 'test_failed', 'No Supabase client'));
    out.push(row('qa_rpc', 'QA RPC migration available', 'test_failed', 'No Supabase client'));
    out.push(row('realtime', 'Realtime enabled for trade_offers', 'test_failed', 'No Supabase client'));
    out.push(await probeStripeCheckout());
    return out;
  }

  if (!signed) {
    out.push(row('my_live_listing', 'Current user has at least one live listing', 'missing', 'Sign in to verify'));
    out.push(
      row(
        'partner_live_listing',
        'Demo partner has at least one live listing',
        demo ? 'needs_setup' : 'missing',
        demo ? 'Sign in to verify partner listings' : 'Set demo partner id first',
      ),
    );
    out.push(await probeQaRpc(sb));
    out.push(row('realtime', 'Realtime enabled for trade_offers', 'needs_setup', 'Sign in to probe channel filters'));
    out.push(await probeStripeCheckout());
    return out;
  }

  const actorId = userId as string;

  const mine = await hasLiveListingForSeller(sb, actorId);
  out.push(
    row(
      'my_live_listing',
      'Current user has at least one live listing',
      mine ? 'ready' : 'missing',
      mine ? undefined : 'Create a live listing or use QA “Create test listing”',
    ),
  );

  if (!demo) {
    out.push(
      row(
        'partner_live_listing',
        'Demo partner has at least one live listing',
        'missing',
        'Set EXPO_PUBLIC_TRADE_DEMO_PARTNER_USER_ID',
      ),
    );
  } else {
    const partnerHas = await hasLiveListingForSeller(sb, demo);
    out.push(
      row(
        'partner_live_listing',
        'Demo partner has at least one live listing',
        partnerHas ? 'ready' : 'missing',
        partnerHas ? undefined : 'Partner needs a live listing or use QA RPC seed button',
      ),
    );
  }

  out.push(await probeQaRpc(sb));
  out.push(await probeRealtime(sb, actorId));
  out.push(await probeStripeCheckout());

  return out;
}
