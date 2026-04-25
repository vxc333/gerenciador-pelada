-- Tournament module (autonomous and auditable)
-- Scope: lifecycle, registrations, temporary player-team bindings,
-- transfers, fixtures, results validation, achievements, and stats.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE public.tournament_status AS ENUM (
  'DRAFT',
  'INSCRICOES_ABERTAS',
  'INSCRICOES_ENCERRADAS',
  'TABELA_GERADA',
  'EM_ANDAMENTO',
  'FINALIZADO',
  'ARQUIVADO'
);

CREATE TYPE public.tournament_type AS ENUM (
  'LIGA',
  'MATA_MATA',
  'GRUPOS_COM_MATA_MATA'
);

CREATE TYPE public.player_invite_status AS ENUM (
  'PENDENTE',
  'ACEITO',
  'RECUSADO'
);

CREATE TYPE public.tournament_player_link_status AS ENUM (
  'ATIVO',
  'REMOVIDO',
  'SUBSTITUIDO'
);

CREATE TYPE public.tournament_player_link_origin AS ENUM (
  'LIVRE',
  'TRANSFERENCIA_INTERNA',
  'HISTORICO_TORNEIO_ANTERIOR'
);

CREATE TYPE public.tournament_transfer_source AS ENUM (
  'LIVRE',
  'TRANSFERENCIA'
);

CREATE TYPE public.match_status AS ENUM (
  'AGENDADO',
  'EM_ANDAMENTO',
  'FINALIZADO',
  'WO'
);

CREATE TYPE public.match_result_status AS ENUM (
  'RASCUNHO',
  'VALIDADO'
);

CREATE TYPE public.card_type AS ENUM (
  'AMARELO',
  'VERMELHO'
);

CREATE TYPE public.achievement_type AS ENUM (
  'CAMPEAO',
  'VICE_CAMPEAO',
  'ARTILHEIRO',
  'GARCOM',
  'MELHOR_DEFESA',
  'FAIR_PLAY',
  'PARTICIPACAO'
);

CREATE TYPE public.tournament_admin_role AS ENUM (
  'ADMIN_SISTEMA',
  'ADMIN_TORNEIO',
  'DONO_TIME'
);

CREATE TABLE IF NOT EXISTS public.tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  tournament_type public.tournament_type NOT NULL,
  status public.tournament_status NOT NULL DEFAULT 'DRAFT',
  has_team_limit BOOLEAN NOT NULL DEFAULT false,
  max_teams INT,
  is_official BOOLEAN NOT NULL DEFAULT false,
  round_trip BOOLEAN NOT NULL DEFAULT false,
  tie_breaker_criteria TEXT[] NOT NULL DEFAULT ARRAY['PONTOS', 'SALDO_GOLS', 'GOLS_PRO'],
  card_accumulation BOOLEAN NOT NULL DEFAULT true,
  image_url TEXT,
  image_version INT NOT NULL DEFAULT 1,
  registration_min_players INT NOT NULL DEFAULT 5,
  transfer_window_starts_at TIMESTAMPTZ,
  transfer_window_ends_at TIMESTAMPTZ,
  transfer_window_closed_at TIMESTAMPTZ,
  allow_result_rollback_on_wo BOOLEAN NOT NULL DEFAULT true,
  keep_result_on_team_withdraw BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  CONSTRAINT tournament_max_teams_check CHECK (
    (has_team_limit = false AND max_teams IS NULL)
    OR
    (has_team_limit = true AND max_teams IS NOT NULL AND max_teams >= 2)
  ),
  CONSTRAINT tournament_transfer_window_check CHECK (
    transfer_window_starts_at IS NULL
    OR transfer_window_ends_at IS NULL
    OR transfer_window_starts_at < transfer_window_ends_at
  )
);

CREATE TABLE IF NOT EXISTS public.tournament_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.tournament_admin_role NOT NULL DEFAULT 'ADMIN_TORNEIO',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.tournament_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  image_url TEXT,
  image_version INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'INSCRITO', 'BLOQUEADO', 'DESISTENTE', 'ELIMINADO', 'CAMPEAO', 'VICE')),
  is_locked BOOLEAN NOT NULL DEFAULT false,
  accepted_players_count INT NOT NULL DEFAULT 0,
  min_players_required INT NOT NULL DEFAULT 5,
  registered_at TIMESTAMPTZ,
  withdrew_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, name)
);

CREATE TABLE IF NOT EXISTS public.tournament_team_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_team_id UUID NOT NULL REFERENCES public.tournament_teams(id) ON DELETE CASCADE,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  invite_status public.player_invite_status NOT NULL DEFAULT 'PENDENTE',
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  UNIQUE (tournament_team_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.tournament_player_team_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  tournament_team_id UUID NOT NULL REFERENCES public.tournament_teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  status public.tournament_player_link_status NOT NULL DEFAULT 'ATIVO',
  origin public.tournament_player_link_origin NOT NULL,
  replaced_by_link_id UUID REFERENCES public.tournament_player_team_links(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT tournament_player_link_dates_check CHECK (ended_at IS NULL OR ended_at >= created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tournament_player_active_link
ON public.tournament_player_team_links (tournament_id, user_id)
WHERE status = 'ATIVO' AND ended_at IS NULL;

CREATE TABLE IF NOT EXISTS public.tournament_transfer_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  from_team_id UUID REFERENCES public.tournament_teams(id) ON DELETE SET NULL,
  to_team_id UUID REFERENCES public.tournament_teams(id) ON DELETE SET NULL,
  source_type public.tournament_transfer_source NOT NULL,
  reason TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tournament_draw_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  algorithm_used TEXT NOT NULL,
  draw_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  drawn_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.tournament_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  draw_audit_id UUID REFERENCES public.tournament_draw_audits(id) ON DELETE SET NULL,
  phase TEXT NOT NULL,
  round_number INT,
  group_label TEXT,
  home_team_id UUID REFERENCES public.tournament_teams(id) ON DELETE SET NULL,
  away_team_id UUID REFERENCES public.tournament_teams(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ,
  status public.match_status NOT NULL DEFAULT 'AGENDADO',
  winner_team_id UUID REFERENCES public.tournament_teams(id) ON DELETE SET NULL,
  is_walkover BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tournament_match_teams_different CHECK (home_team_id IS NULL OR away_team_id IS NULL OR home_team_id <> away_team_id)
);

CREATE TABLE IF NOT EXISTS public.tournament_match_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_match_id UUID NOT NULL UNIQUE REFERENCES public.tournament_matches(id) ON DELETE CASCADE,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  status public.match_result_status NOT NULL DEFAULT 'RASCUNHO',
  home_score INT NOT NULL DEFAULT 0 CHECK (home_score >= 0),
  away_score INT NOT NULL DEFAULT 0 CHECK (away_score >= 0),
  mvp_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  validated_at TIMESTAMPTZ,
  validated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tournament_match_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_match_result_id UUID NOT NULL REFERENCES public.tournament_match_results(id) ON DELETE CASCADE,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES public.tournament_matches(id) ON DELETE CASCADE,
  player_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  team_id UUID NOT NULL REFERENCES public.tournament_teams(id) ON DELETE RESTRICT,
  assist_player_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  minute_mark INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tournament_match_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_match_result_id UUID NOT NULL REFERENCES public.tournament_match_results(id) ON DELETE CASCADE,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES public.tournament_matches(id) ON DELETE CASCADE,
  player_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  card_type public.card_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tournament_player_stats (
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  player_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  matches_played INT NOT NULL DEFAULT 0,
  goals INT NOT NULL DEFAULT 0,
  assists INT NOT NULL DEFAULT 0,
  yellow_cards INT NOT NULL DEFAULT 0,
  red_cards INT NOT NULL DEFAULT 0,
  mvp_count INT NOT NULL DEFAULT 0,
  fair_play_points INT NOT NULL DEFAULT 100,
  avg_goals NUMERIC(8,4) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, player_user_id)
);

CREATE TABLE IF NOT EXISTS public.tournament_achievement_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  achievement_type public.achievement_type NOT NULL,
  version INT NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, achievement_type, version)
);

CREATE TABLE IF NOT EXISTS public.tournament_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  achievement_catalog_id UUID NOT NULL REFERENCES public.tournament_achievement_catalog(id) ON DELETE RESTRICT,
  achievement_type public.achievement_type NOT NULL,
  version INT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  team_id UUID REFERENCES public.tournament_teams(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (achievement_catalog_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.tournament_file_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  file_scope TEXT NOT NULL CHECK (file_scope IN ('TOURNAMENT_IMAGE', 'TEAM_IMAGE')),
  team_id UUID REFERENCES public.tournament_teams(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_version INT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tournament_file_versions_versioned
ON public.tournament_file_versions (
  tournament_id,
  file_scope,
  COALESCE(team_id, '00000000-0000-0000-0000-000000000000'::uuid),
  file_version
);

CREATE TABLE IF NOT EXISTS public.tournament_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  entity_id UUID,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tournaments_status ON public.tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournament_admins_user_id ON public.tournament_admins(user_id);
CREATE INDEX IF NOT EXISTS idx_tournament_teams_tournament_id ON public.tournament_teams(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_team_players_tournament_id ON public.tournament_team_players(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_links_tournament_id ON public.tournament_player_team_links(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_transfer_events_tournament_id ON public.tournament_transfer_events(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament_id ON public.tournament_matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_results_tournament_id ON public.tournament_match_results(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_goals_tournament_id ON public.tournament_match_goals(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_cards_tournament_id ON public.tournament_match_cards(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_stats_tournament_id ON public.tournament_player_stats(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_achievements_tournament_id ON public.tournament_achievements(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_audit_log_tournament_id ON public.tournament_audit_log(tournament_id);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_tournament_system_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin(p_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.app_super_admins sa
      WHERE sa.user_id = p_user_id
    );
$$;

CREATE OR REPLACE FUNCTION public.is_tournament_admin(p_tournament_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tournaments t
    WHERE t.id = p_tournament_id
      AND t.created_by = p_user_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.tournament_admins ta
    WHERE ta.tournament_id = p_tournament_id
      AND ta.user_id = p_user_id
      AND ta.role IN ('ADMIN_SISTEMA', 'ADMIN_TORNEIO')
  )
  OR public.is_tournament_system_admin(p_user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_tournament_team_owner(p_team_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tournament_teams tt
    WHERE tt.id = p_team_id
      AND tt.owner_user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.ensure_tournament_not_read_only(p_tournament_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.tournament_status;
BEGIN
  SELECT status INTO v_status
  FROM public.tournaments
  WHERE id = p_tournament_id;

  IF v_status IN ('FINALIZADO', 'ARQUIVADO') THEN
    RAISE EXCEPTION 'Torneio finalizado/arquivado. Dados imutaveis.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_transfer_window_open(p_tournament_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.status IN ('INSCRICOES_ABERTAS', 'INSCRICOES_ENCERRADAS', 'TABELA_GERADA')
    AND t.transfer_window_closed_at IS NULL
    AND (t.transfer_window_starts_at IS NULL OR now() >= t.transfer_window_starts_at)
    AND (t.transfer_window_ends_at IS NULL OR now() <= t.transfer_window_ends_at)
  FROM public.tournaments t
  WHERE t.id = p_tournament_id;
$$;

CREATE OR REPLACE FUNCTION public.tg_tournament_lock_after_finalization()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('FINALIZADO', 'ARQUIVADO') THEN
    IF NEW.status = 'ARQUIVADO' AND OLD.status = 'FINALIZADO' THEN
      NEW.archived_at = COALESCE(NEW.archived_at, now());
      RETURN NEW;
    END IF;

    IF NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'Torneio em estado finalizado/arquivado e somente leitura';
    END IF;
  END IF;

  IF NEW.status = 'FINALIZADO' AND OLD.status <> 'FINALIZADO' THEN
    NEW.finalized_at = COALESCE(NEW.finalized_at, now());
  END IF;

  IF NEW.status = 'EM_ANDAMENTO' AND OLD.status <> 'EM_ANDAMENTO' THEN
    NEW.transfer_window_closed_at = COALESCE(NEW.transfer_window_closed_at, now());
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_require_tournament_mutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_tournament_id uuid;
BEGIN
  v_tournament_id := COALESCE(NEW.tournament_id, OLD.tournament_id);
  PERFORM public.ensure_tournament_not_read_only(v_tournament_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_sync_registered_team_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_team_id uuid;
  v_tournament_id uuid;
  v_accepted_count int;
  v_pending_or_rejected int;
  v_min_required int;
BEGIN
  v_team_id := COALESCE(NEW.tournament_team_id, OLD.tournament_team_id);

  SELECT tt.tournament_id, tt.min_players_required
    INTO v_tournament_id, v_min_required
  FROM public.tournament_teams tt
  WHERE tt.id = v_team_id;

  IF v_tournament_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT
    count(*) FILTER (WHERE invite_status = 'ACEITO'),
    count(*) FILTER (WHERE invite_status <> 'ACEITO')
  INTO v_accepted_count, v_pending_or_rejected
  FROM public.tournament_team_players ttp
  WHERE ttp.tournament_team_id = v_team_id;

  UPDATE public.tournament_teams
  SET
    accepted_players_count = COALESCE(v_accepted_count, 0),
    status = CASE
      WHEN COALESCE(v_pending_or_rejected, 0) = 0 AND COALESCE(v_accepted_count, 0) >= min_players_required THEN 'INSCRITO'
      ELSE 'PENDENTE'
    END,
    is_locked = CASE
      WHEN COALESCE(v_pending_or_rejected, 0) = 0 AND COALESCE(v_accepted_count, 0) >= min_players_required THEN true
      ELSE false
    END,
    registered_at = CASE
      WHEN COALESCE(v_pending_or_rejected, 0) = 0 AND COALESCE(v_accepted_count, 0) >= min_players_required THEN COALESCE(registered_at, now())
      ELSE NULL
    END,
    updated_at = now()
  WHERE id = v_team_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.rebuild_tournament_player_stats(p_tournament_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.tournament_player_stats s
  WHERE s.tournament_id = p_tournament_id;

  INSERT INTO public.tournament_player_stats (
    tournament_id,
    player_user_id,
    matches_played,
    goals,
    assists,
    yellow_cards,
    red_cards,
    mvp_count,
    fair_play_points,
    avg_goals,
    updated_at
  )
  WITH validated_matches AS (
    SELECT
      r.tournament_id,
      r.tournament_match_id,
      m.home_team_id,
      m.away_team_id,
      r.mvp_user_id
    FROM public.tournament_match_results r
    JOIN public.tournament_matches m ON m.id = r.tournament_match_id
    WHERE r.tournament_id = p_tournament_id
      AND r.status = 'VALIDADO'
  ),
  active_players AS (
    SELECT DISTINCT
      l.tournament_id,
      l.user_id,
      l.tournament_team_id
    FROM public.tournament_player_team_links l
    WHERE l.tournament_id = p_tournament_id
      AND l.status = 'ATIVO'
  ),
  matches_by_player AS (
    SELECT
      ap.tournament_id,
      ap.user_id,
      count(*)::int AS matches_played
    FROM active_players ap
    JOIN validated_matches vm
      ON vm.tournament_id = ap.tournament_id
     AND ap.tournament_team_id IN (vm.home_team_id, vm.away_team_id)
    GROUP BY ap.tournament_id, ap.user_id
  ),
  goals_by_player AS (
    SELECT
      g.tournament_id,
      g.player_user_id AS user_id,
      count(*)::int AS goals
    FROM public.tournament_match_goals g
    JOIN public.tournament_match_results r ON r.id = g.tournament_match_result_id
    WHERE g.tournament_id = p_tournament_id
      AND r.status = 'VALIDADO'
    GROUP BY g.tournament_id, g.player_user_id
  ),
  assists_by_player AS (
    SELECT
      g.tournament_id,
      g.assist_player_user_id AS user_id,
      count(*)::int AS assists
    FROM public.tournament_match_goals g
    JOIN public.tournament_match_results r ON r.id = g.tournament_match_result_id
    WHERE g.tournament_id = p_tournament_id
      AND r.status = 'VALIDADO'
      AND g.assist_player_user_id IS NOT NULL
    GROUP BY g.tournament_id, g.assist_player_user_id
  ),
  cards_by_player AS (
    SELECT
      c.tournament_id,
      c.player_user_id AS user_id,
      count(*) FILTER (WHERE c.card_type = 'AMARELO')::int AS yellow_cards,
      count(*) FILTER (WHERE c.card_type = 'VERMELHO')::int AS red_cards
    FROM public.tournament_match_cards c
    JOIN public.tournament_match_results r ON r.id = c.tournament_match_result_id
    WHERE c.tournament_id = p_tournament_id
      AND r.status = 'VALIDADO'
    GROUP BY c.tournament_id, c.player_user_id
  ),
  mvp_by_player AS (
    SELECT
      r.tournament_id,
      r.mvp_user_id AS user_id,
      count(*)::int AS mvp_count
    FROM public.tournament_match_results r
    WHERE r.tournament_id = p_tournament_id
      AND r.status = 'VALIDADO'
      AND r.mvp_user_id IS NOT NULL
    GROUP BY r.tournament_id, r.mvp_user_id
  ),
  all_players AS (
    SELECT tournament_id, user_id FROM matches_by_player
    UNION
    SELECT tournament_id, user_id FROM goals_by_player
    UNION
    SELECT tournament_id, user_id FROM assists_by_player
    UNION
    SELECT tournament_id, user_id FROM cards_by_player
    UNION
    SELECT tournament_id, user_id FROM mvp_by_player
  )
  SELECT
    p.tournament_id,
    p.user_id,
    COALESCE(m.matches_played, 0),
    COALESCE(g.goals, 0),
    COALESCE(a.assists, 0),
    COALESCE(c.yellow_cards, 0),
    COALESCE(c.red_cards, 0),
    COALESCE(v.mvp_count, 0),
    GREATEST(0, 100 - (COALESCE(c.yellow_cards, 0) * 5 + COALESCE(c.red_cards, 0) * 20)),
    CASE
      WHEN COALESCE(m.matches_played, 0) = 0 THEN 0
      ELSE COALESCE(g.goals, 0)::numeric / m.matches_played::numeric
    END,
    now()
  FROM all_players p
  LEFT JOIN matches_by_player m ON m.tournament_id = p.tournament_id AND m.user_id = p.user_id
  LEFT JOIN goals_by_player g ON g.tournament_id = p.tournament_id AND g.user_id = p.user_id
  LEFT JOIN assists_by_player a ON a.tournament_id = p.tournament_id AND a.user_id = p.user_id
  LEFT JOIN cards_by_player c ON c.tournament_id = p.tournament_id AND c.user_id = p.user_id
  LEFT JOIN mvp_by_player v ON v.tournament_id = p.tournament_id AND v.user_id = p.user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_rebuild_stats_on_result_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.rebuild_tournament_player_stats(COALESCE(NEW.tournament_id, OLD.tournament_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.write_tournament_audit_log(
  p_tournament_id uuid,
  p_action text,
  p_entity_name text,
  p_entity_id uuid,
  p_old_data jsonb,
  p_new_data jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.tournament_audit_log (
    tournament_id,
    actor_user_id,
    action,
    entity_name,
    entity_id,
    old_data,
    new_data
  ) VALUES (
    p_tournament_id,
    auth.uid(),
    p_action,
    p_entity_name,
    p_entity_id,
    p_old_data,
    p_new_data
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_log_tournament_results_changes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_tournament_id uuid;
BEGIN
  v_tournament_id := COALESCE(NEW.tournament_id, OLD.tournament_id);

  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_tournament_audit_log(v_tournament_id, 'RESULT_CREATED', TG_TABLE_NAME, NEW.id, NULL, to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.write_tournament_audit_log(v_tournament_id, 'RESULT_UPDATED', TG_TABLE_NAME, NEW.id, to_jsonb(OLD), to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.write_tournament_audit_log(v_tournament_id, 'RESULT_DELETED', TG_TABLE_NAME, OLD.id, to_jsonb(OLD), NULL);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE VIEW public.v_tournament_team_registration_status AS
SELECT
  tt.id AS tournament_team_id,
  tt.tournament_id,
  tt.name AS team_name,
  tt.owner_user_id,
  tt.status,
  tt.is_locked,
  tt.accepted_players_count,
  tt.min_players_required,
  count(*) FILTER (WHERE ttp.invite_status = 'PENDENTE')::int AS pending_invites,
  count(*) FILTER (WHERE ttp.invite_status = 'RECUSADO')::int AS rejected_invites,
  (tt.accepted_players_count >= tt.min_players_required
    AND count(*) FILTER (WHERE ttp.invite_status IN ('PENDENTE', 'RECUSADO')) = 0) AS is_fully_registered
FROM public.tournament_teams tt
LEFT JOIN public.tournament_team_players ttp ON ttp.tournament_team_id = tt.id
GROUP BY tt.id;

CREATE OR REPLACE VIEW public.v_tournament_rankings AS
SELECT
  s.tournament_id,
  s.player_user_id,
  s.matches_played,
  s.goals,
  s.assists,
  s.avg_goals,
  s.yellow_cards,
  s.red_cards,
  s.fair_play_points,
  row_number() OVER (PARTITION BY s.tournament_id ORDER BY s.goals DESC, s.assists DESC, s.matches_played ASC) AS artillery_rank,
  row_number() OVER (PARTITION BY s.tournament_id ORDER BY s.assists DESC, s.goals DESC) AS assists_rank,
  row_number() OVER (PARTITION BY s.tournament_id ORDER BY s.fair_play_points DESC, s.yellow_cards ASC, s.red_cards ASC) AS fair_play_rank
FROM public.tournament_player_stats s;

CREATE OR REPLACE VIEW public.v_user_global_tournament_stats AS
SELECT
  s.player_user_id,
  count(DISTINCT s.tournament_id)::int AS tournaments_played,
  sum(s.matches_played)::int AS total_matches,
  sum(s.goals)::int AS total_goals,
  sum(s.assists)::int AS total_assists,
  sum(s.yellow_cards)::int AS total_yellow_cards,
  sum(s.red_cards)::int AS total_red_cards,
  avg(s.avg_goals)::numeric(8,4) AS avg_goals_per_tournament
FROM public.tournament_player_stats s
GROUP BY s.player_user_id;

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_team_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_player_team_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_transfer_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_draw_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_match_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_match_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_match_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_player_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_achievement_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_file_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view tournaments" ON public.tournaments;
CREATE POLICY "Anyone can view tournaments"
ON public.tournaments
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Tournament admins can create tournaments" ON public.tournaments;
CREATE POLICY "Tournament admins can create tournaments"
ON public.tournaments
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Tournament admins can update tournaments" ON public.tournaments;
CREATE POLICY "Tournament admins can update tournaments"
ON public.tournaments
FOR UPDATE
TO authenticated
USING (public.is_tournament_admin(id, auth.uid()))
WITH CHECK (public.is_tournament_admin(id, auth.uid()));

DROP POLICY IF EXISTS "System admins can archive tournaments" ON public.tournaments;
CREATE POLICY "System admins can archive tournaments"
ON public.tournaments
FOR UPDATE
TO authenticated
USING (public.is_tournament_system_admin(auth.uid()))
WITH CHECK (public.is_tournament_system_admin(auth.uid()));

DROP POLICY IF EXISTS "Tournament admins can manage tournament admins" ON public.tournament_admins;
CREATE POLICY "Tournament admins can manage tournament admins"
ON public.tournament_admins
FOR ALL
TO authenticated
USING (public.is_tournament_admin(tournament_id, auth.uid()))
WITH CHECK (public.is_tournament_admin(tournament_id, auth.uid()));

DROP POLICY IF EXISTS "Anyone can view teams by tournament access" ON public.tournament_teams;
CREATE POLICY "Anyone can view teams by tournament access"
ON public.tournament_teams
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Team owner or admin can create teams" ON public.tournament_teams;
CREATE POLICY "Team owner or admin can create teams"
ON public.tournament_teams
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = owner_user_id
  OR public.is_tournament_admin(tournament_id, auth.uid())
);

DROP POLICY IF EXISTS "Team owner or admin can update teams" ON public.tournament_teams;
CREATE POLICY "Team owner or admin can update teams"
ON public.tournament_teams
FOR UPDATE
TO authenticated
USING (
  public.is_tournament_team_owner(id, auth.uid())
  OR public.is_tournament_admin(tournament_id, auth.uid())
)
WITH CHECK (
  public.is_tournament_team_owner(id, auth.uid())
  OR public.is_tournament_admin(tournament_id, auth.uid())
);

DROP POLICY IF EXISTS "Team owner or admin can manage players" ON public.tournament_team_players;
CREATE POLICY "Team owner or admin can manage players"
ON public.tournament_team_players
FOR ALL
TO authenticated
USING (
  public.is_tournament_admin(tournament_id, auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.tournament_teams tt
    WHERE tt.id = tournament_team_id
      AND tt.owner_user_id = auth.uid()
  )
  OR auth.uid() = user_id
)
WITH CHECK (
  public.is_tournament_admin(tournament_id, auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.tournament_teams tt
    WHERE tt.id = tournament_team_id
      AND tt.owner_user_id = auth.uid()
  )
  OR auth.uid() = user_id
);

DROP POLICY IF EXISTS "Tournament admins can manage temporary links" ON public.tournament_player_team_links;
CREATE POLICY "Tournament admins can manage temporary links"
ON public.tournament_player_team_links
FOR ALL
TO authenticated
USING (public.is_tournament_admin(tournament_id, auth.uid()))
WITH CHECK (public.is_tournament_admin(tournament_id, auth.uid()));

DROP POLICY IF EXISTS "Tournament admins can manage transfers" ON public.tournament_transfer_events;
CREATE POLICY "Tournament admins can manage transfers"
ON public.tournament_transfer_events
FOR ALL
TO authenticated
USING (public.is_tournament_admin(tournament_id, auth.uid()))
WITH CHECK (
  public.is_tournament_admin(tournament_id, auth.uid())
  AND public.is_transfer_window_open(tournament_id)
);

DROP POLICY IF EXISTS "Tournament admins can manage draw audits" ON public.tournament_draw_audits;
CREATE POLICY "Tournament admins can manage draw audits"
ON public.tournament_draw_audits
FOR ALL
TO authenticated
USING (public.is_tournament_admin(tournament_id, auth.uid()))
WITH CHECK (public.is_tournament_admin(tournament_id, auth.uid()));

DROP POLICY IF EXISTS "Users can view matches" ON public.tournament_matches;
CREATE POLICY "Users can view matches"
ON public.tournament_matches
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Tournament admins can manage matches" ON public.tournament_matches;
CREATE POLICY "Tournament admins can manage matches"
ON public.tournament_matches
FOR ALL
TO authenticated
USING (public.is_tournament_admin(tournament_id, auth.uid()))
WITH CHECK (public.is_tournament_admin(tournament_id, auth.uid()));

DROP POLICY IF EXISTS "Users can view match results" ON public.tournament_match_results;
CREATE POLICY "Users can view match results"
ON public.tournament_match_results
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Tournament admins can manage match results" ON public.tournament_match_results;
CREATE POLICY "Tournament admins can manage match results"
ON public.tournament_match_results
FOR ALL
TO authenticated
USING (public.is_tournament_admin(tournament_id, auth.uid()))
WITH CHECK (public.is_tournament_admin(tournament_id, auth.uid()));

DROP POLICY IF EXISTS "Tournament admins can manage goals" ON public.tournament_match_goals;
CREATE POLICY "Tournament admins can manage goals"
ON public.tournament_match_goals
FOR ALL
TO authenticated
USING (public.is_tournament_admin(tournament_id, auth.uid()))
WITH CHECK (public.is_tournament_admin(tournament_id, auth.uid()));

DROP POLICY IF EXISTS "Tournament admins can manage cards" ON public.tournament_match_cards;
CREATE POLICY "Tournament admins can manage cards"
ON public.tournament_match_cards
FOR ALL
TO authenticated
USING (public.is_tournament_admin(tournament_id, auth.uid()))
WITH CHECK (public.is_tournament_admin(tournament_id, auth.uid()));

DROP POLICY IF EXISTS "Users can read tournament stats" ON public.tournament_player_stats;
CREATE POLICY "Users can read tournament stats"
ON public.tournament_player_stats
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Tournament admins can manage achievement catalog" ON public.tournament_achievement_catalog;
CREATE POLICY "Tournament admins can manage achievement catalog"
ON public.tournament_achievement_catalog
FOR ALL
TO authenticated
USING (public.is_tournament_admin(tournament_id, auth.uid()))
WITH CHECK (public.is_tournament_admin(tournament_id, auth.uid()));

DROP POLICY IF EXISTS "Tournament admins can grant achievements" ON public.tournament_achievements;
CREATE POLICY "Tournament admins can grant achievements"
ON public.tournament_achievements
FOR ALL
TO authenticated
USING (public.is_tournament_admin(tournament_id, auth.uid()))
WITH CHECK (public.is_tournament_admin(tournament_id, auth.uid()));

DROP POLICY IF EXISTS "Users can read achievements" ON public.tournament_achievements;
CREATE POLICY "Users can read achievements"
ON public.tournament_achievements
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Tournament admins can manage file versions" ON public.tournament_file_versions;
CREATE POLICY "Tournament admins can manage file versions"
ON public.tournament_file_versions
FOR ALL
TO authenticated
USING (public.is_tournament_admin(tournament_id, auth.uid()))
WITH CHECK (public.is_tournament_admin(tournament_id, auth.uid()));

DROP POLICY IF EXISTS "Tournament admins can read audit log" ON public.tournament_audit_log;
CREATE POLICY "Tournament admins can read audit log"
ON public.tournament_audit_log
FOR SELECT
TO authenticated
USING (public.is_tournament_admin(tournament_id, auth.uid()));

DROP POLICY IF EXISTS "Service can write audit log" ON public.tournament_audit_log;
CREATE POLICY "Service can write audit log"
ON public.tournament_audit_log
FOR INSERT
TO authenticated
WITH CHECK (public.is_tournament_admin(tournament_id, auth.uid()));

DROP TRIGGER IF EXISTS trg_tournaments_updated_at ON public.tournaments;
CREATE TRIGGER trg_tournaments_updated_at
BEFORE UPDATE ON public.tournaments
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_tournament_teams_updated_at ON public.tournament_teams;
CREATE TRIGGER trg_tournament_teams_updated_at
BEFORE UPDATE ON public.tournament_teams
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_tournament_matches_updated_at ON public.tournament_matches;
CREATE TRIGGER trg_tournament_matches_updated_at
BEFORE UPDATE ON public.tournament_matches
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_tournament_results_updated_at ON public.tournament_match_results;
CREATE TRIGGER trg_tournament_results_updated_at
BEFORE UPDATE ON public.tournament_match_results
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_tournaments_lock_after_finalization ON public.tournaments;
CREATE TRIGGER trg_tournaments_lock_after_finalization
BEFORE UPDATE ON public.tournaments
FOR EACH ROW
EXECUTE FUNCTION public.tg_tournament_lock_after_finalization();

DROP TRIGGER IF EXISTS trg_tournament_teams_require_mutable ON public.tournament_teams;
CREATE TRIGGER trg_tournament_teams_require_mutable
BEFORE INSERT OR UPDATE OR DELETE ON public.tournament_teams
FOR EACH ROW
EXECUTE FUNCTION public.tg_require_tournament_mutable();

DROP TRIGGER IF EXISTS trg_tournament_team_players_require_mutable ON public.tournament_team_players;
CREATE TRIGGER trg_tournament_team_players_require_mutable
BEFORE INSERT OR UPDATE OR DELETE ON public.tournament_team_players
FOR EACH ROW
EXECUTE FUNCTION public.tg_require_tournament_mutable();

DROP TRIGGER IF EXISTS trg_tournament_links_require_mutable ON public.tournament_player_team_links;
CREATE TRIGGER trg_tournament_links_require_mutable
BEFORE INSERT OR UPDATE OR DELETE ON public.tournament_player_team_links
FOR EACH ROW
EXECUTE FUNCTION public.tg_require_tournament_mutable();

DROP TRIGGER IF EXISTS trg_tournament_transfers_require_mutable ON public.tournament_transfer_events;
CREATE TRIGGER trg_tournament_transfers_require_mutable
BEFORE INSERT OR UPDATE OR DELETE ON public.tournament_transfer_events
FOR EACH ROW
EXECUTE FUNCTION public.tg_require_tournament_mutable();

DROP TRIGGER IF EXISTS trg_tournament_draw_audits_require_mutable ON public.tournament_draw_audits;
CREATE TRIGGER trg_tournament_draw_audits_require_mutable
BEFORE INSERT OR UPDATE OR DELETE ON public.tournament_draw_audits
FOR EACH ROW
EXECUTE FUNCTION public.tg_require_tournament_mutable();

DROP TRIGGER IF EXISTS trg_tournament_matches_require_mutable ON public.tournament_matches;
CREATE TRIGGER trg_tournament_matches_require_mutable
BEFORE INSERT OR UPDATE OR DELETE ON public.tournament_matches
FOR EACH ROW
EXECUTE FUNCTION public.tg_require_tournament_mutable();

DROP TRIGGER IF EXISTS trg_tournament_results_require_mutable ON public.tournament_match_results;
CREATE TRIGGER trg_tournament_results_require_mutable
BEFORE INSERT OR UPDATE OR DELETE ON public.tournament_match_results
FOR EACH ROW
EXECUTE FUNCTION public.tg_require_tournament_mutable();

DROP TRIGGER IF EXISTS trg_tournament_goals_require_mutable ON public.tournament_match_goals;
CREATE TRIGGER trg_tournament_goals_require_mutable
BEFORE INSERT OR UPDATE OR DELETE ON public.tournament_match_goals
FOR EACH ROW
EXECUTE FUNCTION public.tg_require_tournament_mutable();

DROP TRIGGER IF EXISTS trg_tournament_cards_require_mutable ON public.tournament_match_cards;
CREATE TRIGGER trg_tournament_cards_require_mutable
BEFORE INSERT OR UPDATE OR DELETE ON public.tournament_match_cards
FOR EACH ROW
EXECUTE FUNCTION public.tg_require_tournament_mutable();

DROP TRIGGER IF EXISTS trg_sync_registered_team_status ON public.tournament_team_players;
CREATE TRIGGER trg_sync_registered_team_status
AFTER INSERT OR UPDATE OR DELETE ON public.tournament_team_players
FOR EACH ROW
EXECUTE FUNCTION public.tg_sync_registered_team_status();

DROP TRIGGER IF EXISTS trg_rebuild_stats_on_result ON public.tournament_match_results;
CREATE TRIGGER trg_rebuild_stats_on_result
AFTER INSERT OR UPDATE OR DELETE ON public.tournament_match_results
FOR EACH ROW
EXECUTE FUNCTION public.tg_rebuild_stats_on_result_change();

DROP TRIGGER IF EXISTS trg_rebuild_stats_on_goals ON public.tournament_match_goals;
CREATE TRIGGER trg_rebuild_stats_on_goals
AFTER INSERT OR UPDATE OR DELETE ON public.tournament_match_goals
FOR EACH ROW
EXECUTE FUNCTION public.tg_rebuild_stats_on_result_change();

DROP TRIGGER IF EXISTS trg_rebuild_stats_on_cards ON public.tournament_match_cards;
CREATE TRIGGER trg_rebuild_stats_on_cards
AFTER INSERT OR UPDATE OR DELETE ON public.tournament_match_cards
FOR EACH ROW
EXECUTE FUNCTION public.tg_rebuild_stats_on_result_change();

DROP TRIGGER IF EXISTS trg_audit_result_changes ON public.tournament_match_results;
CREATE TRIGGER trg_audit_result_changes
AFTER INSERT OR UPDATE OR DELETE ON public.tournament_match_results
FOR EACH ROW
EXECUTE FUNCTION public.tg_log_tournament_results_changes();

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
      AND c.relname = 'tournaments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tournaments;
  END IF;
END;
$$;

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
      AND c.relname = 'tournament_matches'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_matches;
  END IF;
END;
$$;

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
      AND c.relname = 'tournament_match_results'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_match_results;
  END IF;
END;
$$;
