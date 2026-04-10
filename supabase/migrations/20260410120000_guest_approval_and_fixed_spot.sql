-- Guest approval workflow and fixed approved guest spots

ALTER TABLE public.pelada_member_guests
  ADD COLUMN IF NOT EXISTS approval_status TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.pelada_member_guests
SET approval_status = 'approved'
WHERE approval_status IS NULL;

ALTER TABLE public.pelada_member_guests
  ALTER COLUMN approval_status SET DEFAULT 'approved',
  ALTER COLUMN approval_status SET NOT NULL;

ALTER TABLE public.pelada_member_guests
  DROP CONSTRAINT IF EXISTS pelada_member_guests_approval_status_check,
  ADD CONSTRAINT pelada_member_guests_approval_status_check
    CHECK (approval_status IN ('pending', 'approved', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_pelada_member_guests_approval_status
  ON public.pelada_member_guests(pelada_id, approval_status);

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
  AND (
    (public.is_pelada_admin(pelada_id, auth.uid()) AND approval_status IN ('approved', 'pending'))
    OR (
      NOT public.is_pelada_admin(pelada_id, auth.uid())
      AND approval_status = 'pending'
      AND approved_at IS NULL
      AND approved_by IS NULL
      AND rejected_at IS NULL
      AND rejected_by IS NULL
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
);

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
        AND g.approval_status = 'approved'
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
        AND g.approval_status = 'approved'
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
        AND g.approval_status = 'approved'
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
        AND g.approval_status = 'approved'
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

  -- Approved guests keep their place and are never moved to waitlist automatically.
  UPDATE public.pelada_member_guests g
  SET is_waiting = false
  WHERE g.pelada_id = p_pelada_id
    AND g.approval_status = 'approved'
    AND g.is_waiting IS DISTINCT FROM false;

  -- Pending/rejected guests stay outside waitlist calculations.
  UPDATE public.pelada_member_guests g
  SET is_waiting = false
  WHERE g.pelada_id = p_pelada_id
    AND g.approval_status <> 'approved'
    AND g.is_waiting IS DISTINCT FROM false;
END;
$$;
