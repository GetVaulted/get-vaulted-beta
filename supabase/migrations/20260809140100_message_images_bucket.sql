-- Create the public Storage bucket DM photos upload into, same pattern as avatars/listing-media
-- (public read, service-role-only writes via our own API route). Idempotent so it's safe to re-run.
insert into storage.buckets (id, name, public)
values ('message-images', 'message-images', true)
on conflict (id) do nothing;
