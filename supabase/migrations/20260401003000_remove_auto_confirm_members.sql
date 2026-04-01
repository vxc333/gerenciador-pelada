-- Fix: automatic members should NOT be auto-confirmed in new peladas.
-- They keep automatic ACCESS (no admin approval needed) but must confirm
-- their presence manually for each pelada.
-- Only automatic ADMINS are still auto-added to pelada_admins.

CREATE OR REPLACE FUNCTION public.tg_add_automatic_members_to_new_pelada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Automatic members are NOT inserted into pelada_members anymore.
  -- They still have automatic access (checked via is_automatic_member())
  -- but must confirm their presence manually each time.

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
