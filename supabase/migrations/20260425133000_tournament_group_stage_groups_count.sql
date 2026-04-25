-- Persist quantidade de grupos para torneios com fase de grupos.
ALTER TABLE public.tournaments
ADD COLUMN IF NOT EXISTS group_stage_groups_count INT;

ALTER TABLE public.tournaments
DROP CONSTRAINT IF EXISTS tournament_group_stage_groups_count_check;

ALTER TABLE public.tournaments
ADD CONSTRAINT tournament_group_stage_groups_count_check CHECK (
  group_stage_groups_count IS NULL OR group_stage_groups_count >= 2
);
