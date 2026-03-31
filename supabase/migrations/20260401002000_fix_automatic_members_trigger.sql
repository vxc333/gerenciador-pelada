-- Fix: tg_add_automatic_members_to_new_pelada referenced non-existent 'status'
-- column in pelada_members, causing pelada creation to fail.

CREATE OR REPLACE FUNCTION public.tg_add_automatic_members_to_new_pelada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Add all automatic members to this new pelada (they still need to confirm)
  INSERT INTO public.pelada_members (pelada_id, user_id, member_name, is_automatic_entry)
  SELECT
    NEW.id,
    pam.user_id,
    COALESCE(up.display_name, 'Membro'),
    true
  FROM public.pelada_automatic_members pam
  LEFT JOIN public.user_profiles up ON up.user_id = pam.user_id
  WHERE pam.user_id <> NEW.user_id  -- avoid conflict with owner row
  ON CONFLICT (pelada_id, user_id) DO NOTHING;

  -- Add all automatic admins as delegated admins to this new pelada
  INSERT INTO public.pelada_admins (pelada_id, user_id, created_by)
  SELECT
    NEW.id,
    paa.user_id,
    NULL
  FROM public.pelada_automatic_admins paa
  ON CONFLICT (pelada_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Update INSERT policy to also allow automatic members (respecting confirmations timing)
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
    OR (
      public.is_automatic_member(auth.uid())
      AND EXISTS (
        SELECT 1
        FROM public.peladas p
        WHERE p.id = pelada_id
          AND now() >= p.confirmations_open_at
      )
    )
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
