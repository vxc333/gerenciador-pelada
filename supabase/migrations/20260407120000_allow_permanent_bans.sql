-- Allow permanent (indefinite) bans: make expires_at nullable

ALTER TABLE public.pelada_bans
  ALTER COLUMN expires_at DROP NOT NULL;

ALTER TABLE public.pelada_bans
  DROP CONSTRAINT IF EXISTS pelada_bans_expires_after_banned_check,
  ADD CONSTRAINT pelada_bans_expires_after_banned_check CHECK (expires_at IS NULL OR expires_at > banned_at);

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
  );
$$;
