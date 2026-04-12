-- Permite que admins da pelada confirmem membros do sistema diretamente na lista pública/admin.
-- Mantém a proteção para usuários banidos na pelada/sistema.

DROP POLICY IF EXISTS "Admins can insert members" ON public.pelada_members;
CREATE POLICY "Admins can insert members"
ON public.pelada_members
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_pelada_admin(pelada_id, auth.uid())
  AND NOT public.is_user_banned_for_pelada(pelada_id, user_id)
);
