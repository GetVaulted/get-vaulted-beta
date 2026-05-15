-- Live shows, room members, chat, bids, on-air items, show inventory

CREATE TABLE public.live_shows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  thumbnail_url TEXT,
  status public.live_show_status NOT NULL DEFAULT 'draft',
  scheduled_start TIMESTAMPTZ,
  actual_start TIMESTAMPTZ,
  actual_end TIMESTAMPTZ,
  viewer_count INTEGER NOT NULL DEFAULT 0 CHECK (viewer_count >= 0),
  stream_mode public.stream_mode NOT NULL DEFAULT 'hybrid',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX live_shows_host_idx ON public.live_shows (host_id);
CREATE INDEX live_shows_status_idx ON public.live_shows (status);
CREATE INDEX live_shows_scheduled_idx ON public.live_shows (scheduled_start);

CREATE TRIGGER live_shows_set_updated_at
BEFORE UPDATE ON public.live_shows
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.live_room_members (
  show_id UUID NOT NULL REFERENCES public.live_shows (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (show_id, user_id)
);

CREATE INDEX live_room_members_user_idx ON public.live_room_members (user_id);

CREATE TABLE public.live_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID NOT NULL REFERENCES public.live_shows (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) > 0 AND char_length(body) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX live_chat_show_time_idx ON public.live_chat_messages (show_id, created_at DESC);

CREATE TABLE public.live_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID NOT NULL REFERENCES public.live_shows (id) ON DELETE CASCADE,
  listing_id UUID REFERENCES public.listings (id) ON DELETE SET NULL,
  item_title TEXT NOT NULL,
  current_bid NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (current_bid >= 0),
  winning_bidder_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  timer_end TIMESTAMPTZ,
  status public.live_item_status NOT NULL DEFAULT 'pending',
  custom_button_label TEXT,
  bid_button_label TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX live_items_show_idx ON public.live_items (show_id, sort_order);

CREATE TRIGGER live_items_set_updated_at
BEFORE UPDATE ON public.live_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.live_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID NOT NULL REFERENCES public.live_shows (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  live_item_id UUID REFERENCES public.live_items (id) ON DELETE SET NULL,
  listing_id UUID REFERENCES public.listings (id) ON DELETE SET NULL,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX live_bids_show_idx ON public.live_bids (show_id, created_at DESC);

CREATE TABLE public.live_show_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID NOT NULL REFERENCES public.live_shows (id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES public.listings (id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (show_id, listing_id)
);

CREATE INDEX live_show_inventory_show_idx ON public.live_show_inventory (show_id, sort_order);

-- ---------------------------------------------------------------------------
-- RLS live_shows
-- ---------------------------------------------------------------------------
ALTER TABLE public.live_shows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated reads non-draft shows"
  ON public.live_shows FOR SELECT
  TO authenticated
  USING (status <> 'draft' OR host_id = auth.uid());

CREATE POLICY "Hosts insert own shows"
  ON public.live_shows FOR INSERT
  TO authenticated
  WITH CHECK (host_id = auth.uid());

CREATE POLICY "Hosts update own shows"
  ON public.live_shows FOR UPDATE
  TO authenticated
  USING (host_id = auth.uid())
  WITH CHECK (host_id = auth.uid());

CREATE POLICY "Hosts delete own draft shows"
  ON public.live_shows FOR DELETE
  TO authenticated
  USING (host_id = auth.uid() AND status = 'draft');

-- ---------------------------------------------------------------------------
-- RLS live_room_members
-- ---------------------------------------------------------------------------
ALTER TABLE public.live_room_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see members of shows they joined or host"
  ON public.live_room_members FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.live_shows s WHERE s.id = show_id AND s.host_id = auth.uid())
  );

CREATE POLICY "Users join rooms as self"
  ON public.live_room_members FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users leave own membership"
  ON public.live_room_members FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RLS live_chat_messages
-- ---------------------------------------------------------------------------
ALTER TABLE public.live_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read chat if host or room member"
  ON public.live_chat_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.live_shows s WHERE s.id = show_id AND s.host_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.live_room_members m WHERE m.show_id = live_chat_messages.show_id AND m.user_id = auth.uid())
  );

CREATE POLICY "Authenticated send chat as self when in room or host"
  ON public.live_chat_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      EXISTS (SELECT 1 FROM public.live_shows s WHERE s.id = show_id AND s.host_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.live_room_members m WHERE m.show_id = live_chat_messages.show_id AND m.user_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- RLS live_bids (MVP mock — same visibility as chat)
-- ---------------------------------------------------------------------------
ALTER TABLE public.live_bids ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read bids if host or room member"
  ON public.live_bids FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.live_shows s WHERE s.id = show_id AND s.host_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.live_room_members m WHERE m.show_id = live_bids.show_id AND m.user_id = auth.uid())
  );

CREATE POLICY "Authenticated place bid as self in room"
  ON public.live_bids FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      EXISTS (SELECT 1 FROM public.live_shows s WHERE s.id = show_id AND s.host_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.live_room_members m WHERE m.show_id = live_bids.show_id AND m.user_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- RLS live_items & inventory
-- ---------------------------------------------------------------------------
ALTER TABLE public.live_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read live items if host or member"
  ON public.live_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.live_shows s WHERE s.id = show_id AND s.host_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.live_room_members m WHERE m.show_id = live_items.show_id AND m.user_id = auth.uid())
  );

CREATE POLICY "Host insert live items"
  ON public.live_items FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.live_shows s WHERE s.id = show_id AND s.host_id = auth.uid()));

CREATE POLICY "Host update live items"
  ON public.live_items FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.live_shows s WHERE s.id = show_id AND s.host_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.live_shows s WHERE s.id = show_id AND s.host_id = auth.uid()));

CREATE POLICY "Host delete live items"
  ON public.live_items FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.live_shows s WHERE s.id = show_id AND s.host_id = auth.uid()));

ALTER TABLE public.live_show_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Inventory readable host or member"
  ON public.live_show_inventory FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.live_shows s WHERE s.id = show_id AND s.host_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.live_room_members m WHERE m.show_id = live_show_inventory.show_id AND m.user_id = auth.uid())
  );

CREATE POLICY "Host inserts inventory"
  ON public.live_show_inventory FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.live_shows s WHERE s.id = show_id AND s.host_id = auth.uid()));

CREATE POLICY "Host updates inventory"
  ON public.live_show_inventory FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.live_shows s WHERE s.id = show_id AND s.host_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.live_shows s WHERE s.id = show_id AND s.host_id = auth.uid()));

CREATE POLICY "Host deletes inventory"
  ON public.live_show_inventory FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.live_shows s WHERE s.id = show_id AND s.host_id = auth.uid()));
