-- Allow automatic members to add guests after confirmations open
-- without requiring an approved join request.

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
          AND (
            public.is_automatic_member(auth.uid())
            OR EXISTS (
              SELECT 1
              FROM public.pelada_join_requests r
              WHERE r.pelada_id = pm.pelada_id
                AND r.user_id = auth.uid()
                AND r.status = 'approved'
            )
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
