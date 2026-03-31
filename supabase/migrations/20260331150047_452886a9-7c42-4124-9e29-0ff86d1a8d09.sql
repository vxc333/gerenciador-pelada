
ALTER TABLE public.peladas 
  ADD COLUMN num_teams integer NOT NULL DEFAULT 2,
  ADD COLUMN players_per_team integer NOT NULL DEFAULT 10;

ALTER TABLE public.pelada_players 
  ADD COLUMN is_waiting boolean NOT NULL DEFAULT false,
  ADD COLUMN is_goalkeeper boolean NOT NULL DEFAULT false;

-- Drop the pelada_goalkeepers table since we're merging goalkeeper into pelada_players
-- Actually let's keep it for now and handle in code
