-- Migration 3: Revoke PostgREST client access to QA SECURITY DEFINER RPCs.
-- Functions remain for service-role / direct postgres use; production clients cannot invoke them.

REVOKE EXECUTE ON FUNCTION public.qa_create_incoming_trade_from_demo(uuid, uuid, uuid[]) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.qa_upsert_mock_shipping_labels(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.qa_seed_partner_trade_listing(uuid) FROM anon, authenticated;
