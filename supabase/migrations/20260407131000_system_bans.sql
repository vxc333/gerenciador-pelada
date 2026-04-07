-- Create system-wide bans and update ban-check to consider them

CREATE TABLE IF NOT EXISTS public.system_bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT,
  banned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  banned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_system_bans_user_id ON public.system_bans(user_id);

ALTER TABLE public.system_bans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins can view system bans" ON public.system_bans;
CREATE POLICY "Super admins can view system bans"
ON public.system_bans
FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admins can create system bans" ON public.system_bans;
CREATE POLICY "Super admins can create system bans"
ON public.system_bans
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  AND auth.uid() = banned_by
);

DROP POLICY IF EXISTS "Super admins can delete system bans" ON public.system_bans;
CREATE POLICY "Super admins can delete system bans"
ON public.system_bans
FOR DELETE
TO authenticated
USING (public.is_super_admin(auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.system_bans;

-- Update ban check to include system bans (global bans)
CREATE OR REPLACE FUNCTION public.is_user_banned_for_pelada(p_pelada_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.pelada_bans b
    WHERE b.pelada_id = p_pelada_id
      AND b.user_id = p_user_id
      AND (b.expires_at IS NULL OR b.expires_at > now())
    UNION
    SELECT 1
    FROM public.system_bans sb
    WHERE sb.user_id = p_user_id
      AND (sb.expires_at IS NULL OR sb.expires_at > now())
  );
$$;
