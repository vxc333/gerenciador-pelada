-- Pelada access requests + delegated admins

CREATE TABLE IF NOT EXISTS public.pelada_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pelada_id UUID NOT NULL REFERENCES public.peladas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pelada_id, user_id)
);

CREATE OR REPLACE FUNCTION public.is_pelada_admin(p_pelada_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.peladas p
    WHERE p.id = p_pelada_id
      AND p.user_id = p_user_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.pelada_admins pa
    WHERE pa.pelada_id = p_pelada_id
      AND pa.user_id = p_user_id
  );
$$;

CREATE TABLE IF NOT EXISTS public.pelada_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pelada_id UUID NOT NULL REFERENCES public.peladas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pelada_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_pelada_admins_pelada_id ON public.pelada_admins(pelada_id);
CREATE INDEX IF NOT EXISTS idx_pelada_admins_user_id ON public.pelada_admins(user_id);
CREATE INDEX IF NOT EXISTS idx_pelada_join_requests_pelada_id ON public.pelada_join_requests(pelada_id);
CREATE INDEX IF NOT EXISTS idx_pelada_join_requests_user_id ON public.pelada_join_requests(user_id);

ALTER TABLE public.pelada_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pelada_join_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view pelada admins" ON public.pelada_admins;
CREATE POLICY "Authenticated can view pelada admins"
ON public.pelada_admins
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Pelada admins can manage pelada admins" ON public.pelada_admins;
CREATE POLICY "Pelada admins can manage pelada admins"
ON public.pelada_admins
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_pelada_admin(pelada_id, auth.uid())
  AND auth.uid() = created_by
);

DROP POLICY IF EXISTS "Pelada admins can remove pelada admins" ON public.pelada_admins;
CREATE POLICY "Pelada admins can remove pelada admins"
ON public.pelada_admins
FOR DELETE
TO authenticated
USING (
  public.is_pelada_admin(pelada_id, auth.uid())
);

DROP POLICY IF EXISTS "Users can see own or admin requests" ON public.pelada_join_requests;
CREATE POLICY "Users can see own or admin requests"
ON public.pelada_join_requests
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR public.is_pelada_admin(pelada_id, auth.uid())
);

DROP POLICY IF EXISTS "Users can create own join request" ON public.pelada_join_requests;
CREATE POLICY "Users can create own join request"
ON public.pelada_join_requests
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
);

DROP POLICY IF EXISTS "Pelada admins can review join requests" ON public.pelada_join_requests;
CREATE POLICY "Pelada admins can review join requests"
ON public.pelada_join_requests
FOR UPDATE
TO authenticated
USING (
  public.is_pelada_admin(pelada_id, auth.uid())
)
WITH CHECK (
  public.is_pelada_admin(pelada_id, auth.uid())
);

DROP POLICY IF EXISTS "Users can delete own pending requests" ON public.pelada_join_requests;
CREATE POLICY "Users can delete own pending requests"
ON public.pelada_join_requests
FOR DELETE
TO authenticated
USING (
  (auth.uid() = user_id AND status = 'pending')
  OR public.is_pelada_admin(pelada_id, auth.uid())
);

-- Allow delegated admins to update pelada settings, but keep delete for owner only.
DROP POLICY IF EXISTS "Owners can update peladas" ON public.peladas;
CREATE POLICY "Owners and delegated admins can update peladas"
ON public.peladas
FOR UPDATE
TO authenticated
USING (public.is_pelada_admin(id, auth.uid()))
WITH CHECK (public.is_pelada_admin(id, auth.uid()));

-- Update member policies: user can edit own confirmation, admin actions can be delegated.
DROP POLICY IF EXISTS "Members can insert own confirmation" ON public.pelada_members;
CREATE POLICY "Members can insert own confirmation"
ON public.pelada_members
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    public.is_pelada_admin(pelada_id, auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.pelada_join_requests r
      JOIN public.peladas p ON p.id = r.pelada_id
      WHERE r.pelada_id = pelada_id
        AND r.user_id = auth.uid()
        AND r.status = 'approved'
        AND now() >= p.confirmations_open_at
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
  OR public.is_pelada_admin(pelada_id, auth.uid())
);

DROP POLICY IF EXISTS "Admin can update member statuses" ON public.pelada_members;
CREATE POLICY "Admins can update members"
ON public.pelada_members
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  OR public.is_pelada_admin(pelada_id, auth.uid())
)
WITH CHECK (
  auth.uid() = user_id
  OR public.is_pelada_admin(pelada_id, auth.uid())
);

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
        public.is_pelada_admin(pm.pelada_id, auth.uid())
        OR (
          now() >= p.confirmations_open_at
          AND EXISTS (
            SELECT 1
            FROM public.pelada_join_requests r
            WHERE r.pelada_id = pm.pelada_id
              AND r.user_id = auth.uid()
              AND r.status = 'approved'
          )
        )
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
  OR public.is_pelada_admin(pelada_id, auth.uid())
);

DROP POLICY IF EXISTS "Admin can update guest statuses" ON public.pelada_member_guests;
CREATE POLICY "Admins can update guest statuses"
ON public.pelada_member_guests
FOR UPDATE
TO authenticated
USING (public.is_pelada_admin(pelada_id, auth.uid()))
WITH CHECK (public.is_pelada_admin(pelada_id, auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.pelada_admins;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pelada_join_requests;
