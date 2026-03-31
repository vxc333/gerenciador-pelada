-- Super admin, user profile, bans and list priority

CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_profiles_display_name_not_empty CHECK (length(trim(display_name)) > 0)
);

CREATE TABLE IF NOT EXISTS public.app_super_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.pelada_bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pelada_id UUID NOT NULL REFERENCES public.peladas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT,
  banned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  banned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (pelada_id, user_id)
);

ALTER TABLE public.peladas
  ADD COLUMN IF NOT EXISTS list_priority_mode TEXT NOT NULL DEFAULT 'confirmation_order',
  ADD COLUMN IF NOT EXISTS guest_priority_mode TEXT NOT NULL DEFAULT 'grouped_with_member';

ALTER TABLE public.peladas
  DROP CONSTRAINT IF EXISTS peladas_list_priority_mode_check,
  ADD CONSTRAINT peladas_list_priority_mode_check CHECK (list_priority_mode IN ('confirmation_order', 'member_priority'));

ALTER TABLE public.peladas
  DROP CONSTRAINT IF EXISTS peladas_guest_priority_mode_check,
  ADD CONSTRAINT peladas_guest_priority_mode_check CHECK (guest_priority_mode IN ('grouped_with_member', 'guest_added_order'));

ALTER TABLE public.pelada_members
  ADD COLUMN IF NOT EXISTS priority_score INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS member_avatar_url TEXT;

CREATE INDEX IF NOT EXISTS idx_pelada_bans_pelada_id ON public.pelada_bans(pelada_id);
CREATE INDEX IF NOT EXISTS idx_pelada_bans_user_id ON public.pelada_bans(user_id);

CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.app_super_admins sa
    WHERE sa.user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_pelada_admin(p_pelada_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin(p_user_id)
  OR EXISTS (
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

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_super_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pelada_bans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view profiles" ON public.user_profiles;
CREATE POLICY "Users can view profiles"
ON public.user_profiles
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;
CREATE POLICY "Users can insert own profile"
ON public.user_profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
CREATE POLICY "Users can update own profile"
ON public.user_profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Super admins can view super admins" ON public.app_super_admins;
CREATE POLICY "Super admins can view super admins"
ON public.app_super_admins
FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "No direct super admin writes" ON public.app_super_admins;
CREATE POLICY "No direct super admin writes"
ON public.app_super_admins
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "Admins can view bans" ON public.pelada_bans;
CREATE POLICY "Admins can view bans"
ON public.pelada_bans
FOR SELECT
TO authenticated
USING (public.is_pelada_admin(pelada_id, auth.uid()));

DROP POLICY IF EXISTS "Admins can create bans" ON public.pelada_bans;
CREATE POLICY "Admins can create bans"
ON public.pelada_bans
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_pelada_admin(pelada_id, auth.uid())
  AND auth.uid() = banned_by
);

DROP POLICY IF EXISTS "Admins can delete bans" ON public.pelada_bans;
CREATE POLICY "Admins can delete bans"
ON public.pelada_bans
FOR DELETE
TO authenticated
USING (public.is_pelada_admin(pelada_id, auth.uid()));

-- Only super admin can delegate pelada admins.
DROP POLICY IF EXISTS "Pelada admins can manage pelada admins" ON public.pelada_admins;
CREATE POLICY "Super admins can manage pelada admins"
ON public.pelada_admins
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  AND auth.uid() = created_by
);

DROP POLICY IF EXISTS "Pelada admins can remove pelada admins" ON public.pelada_admins;
CREATE POLICY "Super admins can remove pelada admins"
ON public.pelada_admins
FOR DELETE
TO authenticated
USING (public.is_super_admin(auth.uid()));

-- Join request should be blocked for banned users.
DROP POLICY IF EXISTS "Users can create own join request" ON public.pelada_join_requests;
CREATE POLICY "Users can create own join request"
ON public.pelada_join_requests
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND NOT EXISTS (
    SELECT 1
    FROM public.pelada_bans b
    WHERE b.pelada_id = pelada_id
      AND b.user_id = auth.uid()
  )
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
  AND (
    status <> 'approved'
    OR NOT EXISTS (
      SELECT 1
      FROM public.pelada_bans b
      WHERE b.pelada_id = pelada_id
        AND b.user_id = public.pelada_join_requests.user_id
    )
  )
);

-- Members and guests cannot confirm/add when banned.
DROP POLICY IF EXISTS "Members can insert own confirmation" ON public.pelada_members;
CREATE POLICY "Members can insert own confirmation"
ON public.pelada_members
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND NOT EXISTS (
    SELECT 1
    FROM public.pelada_bans b
    WHERE b.pelada_id = pelada_id
      AND b.user_id = auth.uid()
  )
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
      AND NOT EXISTS (
        SELECT 1
        FROM public.pelada_bans b
        WHERE b.pelada_id = pm.pelada_id
          AND b.user_id = auth.uid()
      )
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

ALTER PUBLICATION supabase_realtime ADD TABLE public.user_profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pelada_bans;
