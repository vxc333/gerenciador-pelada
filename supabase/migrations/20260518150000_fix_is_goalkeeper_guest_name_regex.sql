-- Corrige a regex em is_goalkeeper_guest_name.
-- Com standard_conforming_strings=on (padrão do PostgreSQL), '\\(' é dois backslashes
-- seguidos de '(' no padrão regex, o que não combina com '(' literal.
-- O correto é '\(' (backslash simples), que em ARE corresponde a '(' literal.
CREATE OR REPLACE FUNCTION public.is_goalkeeper_guest_name(p_guest_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $body$
  SELECT COALESCE(p_guest_name, '') ~* '\(goleiro\)\s*$';
$body$;

-- Re-aplicar rebalanceamento em todas as peladas para corrigir estados inconsistentes
-- causados pelo bug (convidados goleiros tratados como jogadores de linha).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.peladas LOOP
    PERFORM public.rebalance_pelada_waitlist(r.id);
  END LOOP;
END;
$$;
