-- Promote pelada delegated admins to system-wide admins
-- When someone is added as a delegated admin to a pelada, they become a system admin

-- Ensure app_super_admins table exists (in case)
CREATE TABLE IF NOT EXISTS public.app_super_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Function to promote delegated pelada admin to system admin
CREATE OR REPLACE FUNCTION public.promote_pelada_admin_to_system()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When a user is added as a pelada admin, also add them to app_super_admins if not already there
  INSERT INTO public.app_super_admins (user_id, created_by)
  VALUES (NEW.user_id, NEW.created_by)
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Drop old trigger if exists
DROP TRIGGER IF EXISTS promote_delegated_admin_trigger ON public.pelada_admins;

-- Create trigger on pelada_admins INSERT
CREATE TRIGGER promote_delegated_admin_trigger
AFTER INSERT ON public.pelada_admins
FOR EACH ROW
EXECUTE FUNCTION public.promote_pelada_admin_to_system();
