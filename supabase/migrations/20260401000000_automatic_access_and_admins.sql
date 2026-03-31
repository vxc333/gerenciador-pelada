-- Automatic access and admin escalation system

-- Add column to track automatic members
ALTER TABLE public.pelada_members
  ADD COLUMN IF NOT EXISTS is_automatic_entry BOOLEAN NOT NULL DEFAULT false;

-- Table for users who have automatic access to all new peladas
-- (approved once = auto-approved forever)
CREATE TABLE IF NOT EXISTS public.pelada_automatic_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

-- Table for users who are admins of ALL peladas in the system
CREATE TABLE IF NOT EXISTS public.pelada_automatic_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_pelada_automatic_members_user_id ON public.pelada_automatic_members(user_id);
CREATE INDEX IF NOT EXISTS idx_pelada_automatic_admins_user_id ON public.pelada_automatic_admins(user_id);

-- When a join request is approved, add user to automatic members for future peladas
CREATE OR REPLACE FUNCTION public.tg_add_user_to_automatic_members()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
    INSERT INTO public.pelada_automatic_members (user_id)
    VALUES (NEW.user_id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS add_user_to_automatic_members ON public.pelada_join_requests;
CREATE TRIGGER add_user_to_automatic_members
AFTER UPDATE ON public.pelada_join_requests
FOR EACH ROW
EXECUTE FUNCTION public.tg_add_user_to_automatic_members();

-- When a delegated admin is added, make them automatic admin
CREATE OR REPLACE FUNCTION public.tg_add_user_to_automatic_admins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.pelada_automatic_admins (user_id, created_by)
  VALUES (NEW.user_id, NEW.created_by)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS add_user_to_automatic_admins ON public.pelada_admins;
CREATE TRIGGER add_user_to_automatic_admins
AFTER INSERT ON public.pelada_admins
FOR EACH ROW
EXECUTE FUNCTION public.tg_add_user_to_automatic_admins();

-- Function to check if user should have automatic access
CREATE OR REPLACE FUNCTION public.is_automatic_member(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.pelada_automatic_members
    WHERE user_id = p_user_id
  );
$$;

-- Function to check if user is automatic admin (admin of all peladas)
CREATE OR REPLACE FUNCTION public.is_automatic_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.pelada_automatic_admins
    WHERE user_id = p_user_id
  );
$$;

-- When a new pelada is created, add all automatic members
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
  WHERE pam.user_id <> NEW.user_id
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

DROP TRIGGER IF EXISTS add_automatic_members_to_new_pelada ON public.peladas;
CREATE TRIGGER add_automatic_members_to_new_pelada
AFTER INSERT ON public.peladas
FOR EACH ROW
EXECUTE FUNCTION public.tg_add_automatic_members_to_new_pelada();

-- Update is_pelada_admin function to include automatic admins
CREATE OR REPLACE FUNCTION public.is_pelada_admin(p_pelada_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin(p_user_id)
  OR public.is_automatic_admin(p_user_id)
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

-- RLS Policies for new tables
ALTER TABLE public.pelada_automatic_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pelada_automatic_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view automatic members list" ON public.pelada_automatic_members;
CREATE POLICY "Anyone can view automatic members list"
ON public.pelada_automatic_members
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Admins can manage automatic members" ON public.pelada_automatic_members;
CREATE POLICY "Admins can manage automatic members"
ON public.pelada_automatic_members
FOR DELETE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.is_automatic_admin(auth.uid())
);

DROP POLICY IF EXISTS "Anyone can view automatic admins list" ON public.pelada_automatic_admins;
CREATE POLICY "Anyone can view automatic admins list"
ON public.pelada_automatic_admins
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Super admins can manage automatic admins" ON public.pelada_automatic_admins;
CREATE POLICY "Super admins can manage automatic admins"
ON public.pelada_automatic_admins
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
);

DROP POLICY IF EXISTS "Super admins can remove automatic admins" ON public.pelada_automatic_admins;
CREATE POLICY "Super admins can remove automatic admins"
ON public.pelada_automatic_admins
FOR DELETE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
);
