-- Waitlist automation and temporary bans by days

ALTER TABLE public.pelada_bans
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

UPDATE public.pelada_bans
SET expires_at = COALESCE(expires_at, banned_at + interval '7 days')
WHERE expires_at IS NULL;

ALTER TABLE public.pelada_bans
  ALTER COLUMN expires_at SET NOT NULL;

ALTER TABLE public.pelada_bans
  DROP CONSTRAINT IF EXISTS pelada_bans_expires_after_banned_check,
  ADD CONSTRAINT pelada_bans_expires_after_banned_check CHECK (expires_at > banned_at);

ALTER TABLE public.pelada_members
  ADD COLUMN IF NOT EXISTS is_waiting BOOLEAN NOT NULL DEFAULT false;

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
      AND b.expires_at > now()
  );
$$;

CREATE OR REPLACE FUNCTION public.rebalance_pelada_waitlist(p_pelada_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_players int;
  v_max_goalkeepers int;
  v_priority_mode text;
BEGIN
  SELECT p.max_players, p.max_goalkeepers, p.list_priority_mode
  INTO v_max_players, v_max_goalkeepers, v_priority_mode
  FROM public.peladas p
  WHERE p.id = p_pelada_id;

  IF v_max_players IS NULL THEN
    RETURN;
  END IF;

  WITH ranked_field_players AS (
    SELECT
      pm.id,
      row_number() OVER (
        ORDER BY
          CASE WHEN v_priority_mode = 'member_priority' THEN pm.priority_score ELSE 0 END DESC,
          pm.created_at ASC
      ) AS rn
    FROM public.pelada_members pm
    WHERE pm.pelada_id = p_pelada_id
      AND pm.is_goalkeeper = false
  )
  UPDATE public.pelada_members pm
  SET is_waiting = (rfp.rn > v_max_players)
  FROM ranked_field_players rfp
  WHERE pm.id = rfp.id
    AND pm.is_waiting IS DISTINCT FROM (rfp.rn > v_max_players);

  WITH ranked_goalkeepers AS (
    SELECT
      pm.id,
      row_number() OVER (
        ORDER BY
          CASE WHEN v_priority_mode = 'member_priority' THEN pm.priority_score ELSE 0 END DESC,
          pm.created_at ASC
      ) AS rn
    FROM public.pelada_members pm
    WHERE pm.pelada_id = p_pelada_id
      AND pm.is_goalkeeper = true
  )
  UPDATE public.pelada_members pm
  SET is_waiting = (rg.rn > v_max_goalkeepers)
  FROM ranked_goalkeepers rg
  WHERE pm.id = rg.id
    AND pm.is_waiting IS DISTINCT FROM (rg.rn > v_max_goalkeepers);
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_rebalance_waitlist_from_members()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Prevent recursive trigger re-entry when rebalance updates is_waiting.
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM public.rebalance_pelada_waitlist(COALESCE(NEW.pelada_id, OLD.pelada_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_rebalance_waitlist_from_pelada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.max_players IS DISTINCT FROM OLD.max_players
    OR NEW.max_goalkeepers IS DISTINCT FROM OLD.max_goalkeepers
    OR NEW.list_priority_mode IS DISTINCT FROM OLD.list_priority_mode THEN
    PERFORM public.rebalance_pelada_waitlist(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rebalance_waitlist_on_member_change ON public.pelada_members;
CREATE TRIGGER rebalance_waitlist_on_member_change
AFTER INSERT OR DELETE OR UPDATE OF pelada_id, is_goalkeeper, priority_score, created_at ON public.pelada_members
FOR EACH ROW
EXECUTE FUNCTION public.tg_rebalance_waitlist_from_members();

DROP TRIGGER IF EXISTS rebalance_waitlist_on_pelada_change ON public.peladas;
CREATE TRIGGER rebalance_waitlist_on_pelada_change
AFTER UPDATE ON public.peladas
FOR EACH ROW
EXECUTE FUNCTION public.tg_rebalance_waitlist_from_pelada();

-- Re-apply existing rows to compute initial waitlist.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.peladas LOOP
    PERFORM public.rebalance_pelada_waitlist(r.id);
  END LOOP;
END;
$$;

-- Policies updated to consider only active bans.
DROP POLICY IF EXISTS "Users can create own join request" ON public.pelada_join_requests;
CREATE POLICY "Users can create own join request"
ON public.pelada_join_requests
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND NOT public.is_user_banned_for_pelada(pelada_id, auth.uid())
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
    OR NOT public.is_user_banned_for_pelada(pelada_id, public.pelada_join_requests.user_id)
  )
);

DROP POLICY IF EXISTS "Members can insert own confirmation" ON public.pelada_members;
CREATE POLICY "Members can insert own confirmation"
ON public.pelada_members
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND NOT public.is_user_banned_for_pelada(pelada_id, auth.uid())
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
      AND NOT public.is_user_banned_for_pelada(pm.pelada_id, auth.uid())
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
