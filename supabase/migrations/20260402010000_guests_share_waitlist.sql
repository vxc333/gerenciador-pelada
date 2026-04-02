ALTER TABLE public.pelada_member_guests
  ADD COLUMN IF NOT EXISTS is_waiting BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.is_goalkeeper_guest_name(p_guest_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_guest_name, '') ~* '\\(goleiro\\)\\s*$';
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
  v_guest_priority_mode text;
BEGIN
  SELECT p.max_players, p.max_goalkeepers, p.list_priority_mode, p.guest_priority_mode
  INTO v_max_players, v_max_goalkeepers, v_priority_mode, v_guest_priority_mode
  FROM public.peladas p
  WHERE p.id = p_pelada_id;

  IF v_max_players IS NULL THEN
    RETURN;
  END IF;

  WITH host_member_order AS (
    SELECT
      pm.id,
      row_number() OVER (
        ORDER BY
          CASE WHEN v_priority_mode = 'member_priority' THEN pm.priority_score ELSE 0 END DESC,
          pm.created_at ASC,
          pm.id ASC
      ) AS host_order_index
    FROM public.pelada_members pm
    WHERE pm.pelada_id = p_pelada_id
  ),
  ordered_field_entries AS (
    SELECT
      entries.entry_type,
      entries.member_id,
      entries.guest_id,
      row_number() OVER (
        ORDER BY
          CASE WHEN v_priority_mode = 'member_priority' THEN entries.priority_score ELSE 0 END DESC,
          CASE WHEN v_guest_priority_mode = 'grouped_with_member' THEN entries.host_order_created_at END ASC,
          CASE WHEN v_guest_priority_mode = 'grouped_with_member' THEN entries.host_order_index END ASC,
          CASE WHEN v_guest_priority_mode = 'grouped_with_member' THEN entries.entry_kind ELSE 0 END ASC,
          entries.entry_created_at ASC,
          entries.entry_id ASC
      ) AS rn
    FROM (
      SELECT
        'member'::text AS entry_type,
        pm.id AS member_id,
        NULL::uuid AS guest_id,
        pm.id AS entry_id,
        pm.priority_score,
        pm.created_at AS host_order_created_at,
        pm.created_at AS entry_created_at,
        COALESCE(hmo.host_order_index, 2147483647) AS host_order_index,
        0 AS entry_kind
      FROM public.pelada_members pm
      LEFT JOIN host_member_order hmo ON hmo.id = pm.id
      WHERE pm.pelada_id = p_pelada_id
        AND pm.is_goalkeeper = false

      UNION ALL

      SELECT
        'guest'::text AS entry_type,
        g.pelada_member_id AS member_id,
        g.id AS guest_id,
        g.id AS entry_id,
        COALESCE(pm.priority_score, 0) AS priority_score,
        COALESCE(pm.created_at, g.created_at) AS host_order_created_at,
        g.created_at AS entry_created_at,
        COALESCE(hmo.host_order_index, 2147483647) AS host_order_index,
        1 AS entry_kind
      FROM public.pelada_member_guests g
      LEFT JOIN public.pelada_members pm ON pm.id = g.pelada_member_id
      LEFT JOIN host_member_order hmo ON hmo.id = g.pelada_member_id
      WHERE g.pelada_id = p_pelada_id
        AND NOT public.is_goalkeeper_guest_name(g.guest_name)
    ) entries
  )
  UPDATE public.pelada_members pm
  SET is_waiting = ranked.is_waiting
  FROM (
    SELECT member_id AS id, (rn > v_max_players) AS is_waiting
    FROM ordered_field_entries
    WHERE entry_type = 'member'
  ) ranked
  WHERE pm.id = ranked.id
    AND pm.is_waiting IS DISTINCT FROM ranked.is_waiting;

  WITH host_member_order AS (
    SELECT
      pm.id,
      row_number() OVER (
        ORDER BY
          CASE WHEN v_priority_mode = 'member_priority' THEN pm.priority_score ELSE 0 END DESC,
          pm.created_at ASC,
          pm.id ASC
      ) AS host_order_index
    FROM public.pelada_members pm
    WHERE pm.pelada_id = p_pelada_id
  ),
  ordered_field_entries AS (
    SELECT
      entries.entry_type,
      entries.member_id,
      entries.guest_id,
      row_number() OVER (
        ORDER BY
          CASE WHEN v_priority_mode = 'member_priority' THEN entries.priority_score ELSE 0 END DESC,
          CASE WHEN v_guest_priority_mode = 'grouped_with_member' THEN entries.host_order_created_at END ASC,
          CASE WHEN v_guest_priority_mode = 'grouped_with_member' THEN entries.host_order_index END ASC,
          CASE WHEN v_guest_priority_mode = 'grouped_with_member' THEN entries.entry_kind ELSE 0 END ASC,
          entries.entry_created_at ASC,
          entries.entry_id ASC
      ) AS rn
    FROM (
      SELECT
        'member'::text AS entry_type,
        pm.id AS member_id,
        NULL::uuid AS guest_id,
        pm.id AS entry_id,
        pm.priority_score,
        pm.created_at AS host_order_created_at,
        pm.created_at AS entry_created_at,
        COALESCE(hmo.host_order_index, 2147483647) AS host_order_index,
        0 AS entry_kind
      FROM public.pelada_members pm
      LEFT JOIN host_member_order hmo ON hmo.id = pm.id
      WHERE pm.pelada_id = p_pelada_id
        AND pm.is_goalkeeper = false

      UNION ALL

      SELECT
        'guest'::text AS entry_type,
        g.pelada_member_id AS member_id,
        g.id AS guest_id,
        g.id AS entry_id,
        COALESCE(pm.priority_score, 0) AS priority_score,
        COALESCE(pm.created_at, g.created_at) AS host_order_created_at,
        g.created_at AS entry_created_at,
        COALESCE(hmo.host_order_index, 2147483647) AS host_order_index,
        1 AS entry_kind
      FROM public.pelada_member_guests g
      LEFT JOIN public.pelada_members pm ON pm.id = g.pelada_member_id
      LEFT JOIN host_member_order hmo ON hmo.id = g.pelada_member_id
      WHERE g.pelada_id = p_pelada_id
        AND NOT public.is_goalkeeper_guest_name(g.guest_name)
    ) entries
  )
  UPDATE public.pelada_member_guests g
  SET is_waiting = ranked.is_waiting
  FROM (
    SELECT guest_id AS id, (rn > v_max_players) AS is_waiting
    FROM ordered_field_entries
    WHERE entry_type = 'guest'
  ) ranked
  WHERE g.id = ranked.id
    AND g.is_waiting IS DISTINCT FROM ranked.is_waiting;

  WITH host_member_order AS (
    SELECT
      pm.id,
      row_number() OVER (
        ORDER BY
          CASE WHEN v_priority_mode = 'member_priority' THEN pm.priority_score ELSE 0 END DESC,
          pm.created_at ASC,
          pm.id ASC
      ) AS host_order_index
    FROM public.pelada_members pm
    WHERE pm.pelada_id = p_pelada_id
  ),
  ordered_goalkeeper_entries AS (
    SELECT
      entries.entry_type,
      entries.member_id,
      entries.guest_id,
      row_number() OVER (
        ORDER BY
          CASE WHEN v_priority_mode = 'member_priority' THEN entries.priority_score ELSE 0 END DESC,
          CASE WHEN v_guest_priority_mode = 'grouped_with_member' THEN entries.host_order_created_at END ASC,
          CASE WHEN v_guest_priority_mode = 'grouped_with_member' THEN entries.host_order_index END ASC,
          CASE WHEN v_guest_priority_mode = 'grouped_with_member' THEN entries.entry_kind ELSE 0 END ASC,
          entries.entry_created_at ASC,
          entries.entry_id ASC
      ) AS rn
    FROM (
      SELECT
        'member'::text AS entry_type,
        pm.id AS member_id,
        NULL::uuid AS guest_id,
        pm.id AS entry_id,
        pm.priority_score,
        pm.created_at AS host_order_created_at,
        pm.created_at AS entry_created_at,
        COALESCE(hmo.host_order_index, 2147483647) AS host_order_index,
        0 AS entry_kind
      FROM public.pelada_members pm
      LEFT JOIN host_member_order hmo ON hmo.id = pm.id
      WHERE pm.pelada_id = p_pelada_id
        AND pm.is_goalkeeper = true

      UNION ALL

      SELECT
        'guest'::text AS entry_type,
        g.pelada_member_id AS member_id,
        g.id AS guest_id,
        g.id AS entry_id,
        COALESCE(pm.priority_score, 0) AS priority_score,
        COALESCE(pm.created_at, g.created_at) AS host_order_created_at,
        g.created_at AS entry_created_at,
        COALESCE(hmo.host_order_index, 2147483647) AS host_order_index,
        1 AS entry_kind
      FROM public.pelada_member_guests g
      LEFT JOIN public.pelada_members pm ON pm.id = g.pelada_member_id
      LEFT JOIN host_member_order hmo ON hmo.id = g.pelada_member_id
      WHERE g.pelada_id = p_pelada_id
        AND public.is_goalkeeper_guest_name(g.guest_name)
    ) entries
  )
  UPDATE public.pelada_members pm
  SET is_waiting = ranked.is_waiting
  FROM (
    SELECT member_id AS id, (rn > v_max_goalkeepers) AS is_waiting
    FROM ordered_goalkeeper_entries
    WHERE entry_type = 'member'
  ) ranked
  WHERE pm.id = ranked.id
    AND pm.is_waiting IS DISTINCT FROM ranked.is_waiting;

  WITH host_member_order AS (
    SELECT
      pm.id,
      row_number() OVER (
        ORDER BY
          CASE WHEN v_priority_mode = 'member_priority' THEN pm.priority_score ELSE 0 END DESC,
          pm.created_at ASC,
          pm.id ASC
      ) AS host_order_index
    FROM public.pelada_members pm
    WHERE pm.pelada_id = p_pelada_id
  ),
  ordered_goalkeeper_entries AS (
    SELECT
      entries.entry_type,
      entries.member_id,
      entries.guest_id,
      row_number() OVER (
        ORDER BY
          CASE WHEN v_priority_mode = 'member_priority' THEN entries.priority_score ELSE 0 END DESC,
          CASE WHEN v_guest_priority_mode = 'grouped_with_member' THEN entries.host_order_created_at END ASC,
          CASE WHEN v_guest_priority_mode = 'grouped_with_member' THEN entries.host_order_index END ASC,
          CASE WHEN v_guest_priority_mode = 'grouped_with_member' THEN entries.entry_kind ELSE 0 END ASC,
          entries.entry_created_at ASC,
          entries.entry_id ASC
      ) AS rn
    FROM (
      SELECT
        'member'::text AS entry_type,
        pm.id AS member_id,
        NULL::uuid AS guest_id,
        pm.id AS entry_id,
        pm.priority_score,
        pm.created_at AS host_order_created_at,
        pm.created_at AS entry_created_at,
        COALESCE(hmo.host_order_index, 2147483647) AS host_order_index,
        0 AS entry_kind
      FROM public.pelada_members pm
      LEFT JOIN host_member_order hmo ON hmo.id = pm.id
      WHERE pm.pelada_id = p_pelada_id
        AND pm.is_goalkeeper = true

      UNION ALL

      SELECT
        'guest'::text AS entry_type,
        g.pelada_member_id AS member_id,
        g.id AS guest_id,
        g.id AS entry_id,
        COALESCE(pm.priority_score, 0) AS priority_score,
        COALESCE(pm.created_at, g.created_at) AS host_order_created_at,
        g.created_at AS entry_created_at,
        COALESCE(hmo.host_order_index, 2147483647) AS host_order_index,
        1 AS entry_kind
      FROM public.pelada_member_guests g
      LEFT JOIN public.pelada_members pm ON pm.id = g.pelada_member_id
      LEFT JOIN host_member_order hmo ON hmo.id = g.pelada_member_id
      WHERE g.pelada_id = p_pelada_id
        AND public.is_goalkeeper_guest_name(g.guest_name)
    ) entries
  )
  UPDATE public.pelada_member_guests g
  SET is_waiting = ranked.is_waiting
  FROM (
    SELECT guest_id AS id, (rn > v_max_goalkeepers) AS is_waiting
    FROM ordered_goalkeeper_entries
    WHERE entry_type = 'guest'
  ) ranked
  WHERE g.id = ranked.id
    AND g.is_waiting IS DISTINCT FROM ranked.is_waiting;
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
    OR NEW.list_priority_mode IS DISTINCT FROM OLD.list_priority_mode
    OR NEW.guest_priority_mode IS DISTINCT FROM OLD.guest_priority_mode THEN
    PERFORM public.rebalance_pelada_waitlist(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_rebalance_waitlist_from_guests()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM public.rebalance_pelada_waitlist(COALESCE(NEW.pelada_id, OLD.pelada_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS rebalance_waitlist_on_guest_change ON public.pelada_member_guests;
CREATE TRIGGER rebalance_waitlist_on_guest_change
AFTER INSERT OR DELETE OR UPDATE OF pelada_id, pelada_member_id, guest_name, created_at ON public.pelada_member_guests
FOR EACH ROW
EXECUTE FUNCTION public.tg_rebalance_waitlist_from_guests();

DROP TRIGGER IF EXISTS rebalance_waitlist_on_pelada_change ON public.peladas;
CREATE TRIGGER rebalance_waitlist_on_pelada_change
AFTER UPDATE ON public.peladas
FOR EACH ROW
EXECUTE FUNCTION public.tg_rebalance_waitlist_from_pelada();

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.peladas LOOP
    PERFORM public.rebalance_pelada_waitlist(r.id);
  END LOOP;
END;
$$;