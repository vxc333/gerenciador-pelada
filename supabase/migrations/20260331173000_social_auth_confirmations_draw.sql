-- Social auth + confirmations with guests + one-time draw

ALTER TABLE public.peladas
  ADD COLUMN IF NOT EXISTS confirmations_open_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS draw_done_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS draw_result JSONB;

UPDATE public.peladas
SET confirmations_open_at = date::timestamp + interval '16 hour' - interval '2 day'
WHERE confirmations_open_at IS NULL;

ALTER TABLE public.peladas
  ALTER COLUMN confirmations_open_at SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.pelada_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pelada_id UUID NOT NULL REFERENCES public.peladas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_name TEXT NOT NULL,
  is_goalkeeper BOOLEAN NOT NULL DEFAULT false,
  admin_selected BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pelada_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.pelada_member_guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pelada_id UUID NOT NULL REFERENCES public.peladas(id) ON DELETE CASCADE,
  pelada_member_id UUID NOT NULL REFERENCES public.pelada_members(id) ON DELETE CASCADE,
  guest_name TEXT NOT NULL,
  admin_selected BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pelada_member_guests_name_not_empty CHECK (length(trim(guest_name)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_pelada_members_pelada_id ON public.pelada_members(pelada_id);
CREATE INDEX IF NOT EXISTS idx_pelada_members_user_id ON public.pelada_members(user_id);
CREATE INDEX IF NOT EXISTS idx_pelada_guests_pelada_id ON public.pelada_member_guests(pelada_id);
CREATE INDEX IF NOT EXISTS idx_pelada_guests_member_id ON public.pelada_member_guests(pelada_member_id);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pelada_members_updated_at ON public.pelada_members;
CREATE TRIGGER trg_pelada_members_updated_at
BEFORE UPDATE ON public.pelada_members
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.pelada_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pelada_member_guests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view members" ON public.pelada_members;
CREATE POLICY "Authenticated can view members"
ON public.pelada_members
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Members can insert own confirmation" ON public.pelada_members;
CREATE POLICY "Members can insert own confirmation"
ON public.pelada_members
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.peladas p
    WHERE p.id = pelada_id
      AND (
        p.user_id = auth.uid()
        OR now() >= p.confirmations_open_at
      )
  )
);

DROP POLICY IF EXISTS "Members can delete own confirmation" ON public.pelada_members;
CREATE POLICY "Members can delete own confirmation"
ON public.pelada_members
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.peladas p
    WHERE p.id = pelada_id
      AND p.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admin can update member statuses" ON public.pelada_members;
CREATE POLICY "Admin can update member statuses"
ON public.pelada_members
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.peladas p
    WHERE p.id = pelada_id
      AND p.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.peladas p
    WHERE p.id = pelada_id
      AND p.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Authenticated can view guests" ON public.pelada_member_guests;
CREATE POLICY "Authenticated can view guests"
ON public.pelada_member_guests
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Members can insert own guests" ON public.pelada_member_guests;
CREATE POLICY "Members can insert own guests"
ON public.pelada_member_guests
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.pelada_members pm
    JOIN public.peladas p ON p.id = pm.pelada_id
    WHERE pm.id = pelada_member_id
      AND pm.pelada_id = pelada_id
      AND pm.user_id = auth.uid()
      AND (
        p.user_id = auth.uid()
        OR now() >= p.confirmations_open_at
      )
  )
);

DROP POLICY IF EXISTS "Members can delete own guests" ON public.pelada_member_guests;
CREATE POLICY "Members can delete own guests"
ON public.pelada_member_guests
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.pelada_members pm
    WHERE pm.id = pelada_member_id
      AND pm.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.peladas p
    WHERE p.id = pelada_id
      AND p.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admin can update guest statuses" ON public.pelada_member_guests;
CREATE POLICY "Admin can update guest statuses"
ON public.pelada_member_guests
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.peladas p
    WHERE p.id = pelada_id
      AND p.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.peladas p
    WHERE p.id = pelada_id
      AND p.user_id = auth.uid()
  )
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.pelada_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pelada_member_guests;
