
-- Remove redundant conflicting policy
DROP POLICY "Anon can delete players" ON public.pelada_players;
