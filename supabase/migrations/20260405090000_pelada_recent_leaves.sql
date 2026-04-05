-- Create table to track recent "left" events per pelada/user
CREATE TABLE IF NOT EXISTS public.pelada_recent_leaves (
  pelada_id UUID NOT NULL REFERENCES public.peladas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  left_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (pelada_id, user_id)
);

ALTER TABLE public.pelada_recent_leaves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own leave" ON public.pelada_recent_leaves;
CREATE POLICY "Users can insert own leave"
ON public.pelada_recent_leaves
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own leave" ON public.pelada_recent_leaves;
CREATE POLICY "Users can view own leave"
ON public.pelada_recent_leaves
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own leave" ON public.pelada_recent_leaves;
CREATE POLICY "Users can update own leave"
ON public.pelada_recent_leaves
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Add table to supabase_realtime publication if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_rel pr
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_publication p ON p.oid = pr.prpubid
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'pelada_recent_leaves'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pelada_recent_leaves;
  END IF;
END;
$$;
