-- Backfill automatic members and make approval trigger robust

-- Safety guard: ensure table exists even if previous migration order failed.
CREATE TABLE IF NOT EXISTS public.pelada_automatic_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_pelada_automatic_members_user_id
  ON public.pelada_automatic_members(user_id);

-- Ensure previously approved users are included as automatic members
DO $$
BEGIN
  IF to_regclass('public.pelada_join_requests') IS NOT NULL THEN
    INSERT INTO public.pelada_automatic_members (user_id)
    SELECT DISTINCT r.user_id
    FROM public.pelada_join_requests r
    WHERE r.status = 'approved'
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END;
$$;

-- If a project has users added directly as members (legacy flow),
-- include them as automatic members as well.
DO $$
BEGIN
  IF to_regclass('public.pelada_members') IS NOT NULL THEN
    INSERT INTO public.pelada_automatic_members (user_id)
    SELECT DISTINCT m.user_id
    FROM public.pelada_members m
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END;
$$;

-- Recreate function to cover both INSERT and UPDATE approval paths
CREATE OR REPLACE FUNCTION public.tg_add_user_to_automatic_members()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    INSERT INTO public.pelada_automatic_members (user_id)
    VALUES (NEW.user_id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.pelada_join_requests') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS add_user_to_automatic_members ON public.pelada_join_requests;
    CREATE TRIGGER add_user_to_automatic_members
    AFTER INSERT OR UPDATE ON public.pelada_join_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_add_user_to_automatic_members();
  END IF;
END;
$$;
