
-- Peladas table
CREATE TABLE public.peladas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'PELADA DO FURTO',
  location TEXT NOT NULL DEFAULT 'IFMA',
  time TEXT NOT NULL DEFAULT '19 H',
  date DATE NOT NULL,
  max_players INT NOT NULL DEFAULT 20,
  max_goalkeepers INT NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Players table
CREATE TABLE public.pelada_players (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pelada_id UUID NOT NULL REFERENCES public.peladas(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INT NOT NULL, -- 1-based index in list
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(pelada_id, position)
);

-- Goalkeepers table
CREATE TABLE public.pelada_goalkeepers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pelada_id UUID NOT NULL REFERENCES public.peladas(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.peladas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pelada_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pelada_goalkeepers ENABLE ROW LEVEL SECURITY;

-- Peladas policies: admin can CRUD their own, anyone can read
CREATE POLICY "Anyone can view peladas" ON public.peladas FOR SELECT USING (true);
CREATE POLICY "Auth users can create peladas" ON public.peladas FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners can update peladas" ON public.peladas FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Owners can delete peladas" ON public.peladas FOR DELETE USING (auth.uid() = user_id);

-- Players policies: anyone can read, anyone can insert (public link), owner can delete
CREATE POLICY "Anyone can view players" ON public.pelada_players FOR SELECT USING (true);
CREATE POLICY "Anyone can add themselves" ON public.pelada_players FOR INSERT WITH CHECK (true);
CREATE POLICY "Pelada owner can delete players" ON public.pelada_players FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.peladas WHERE id = pelada_id AND user_id = auth.uid()));
CREATE POLICY "Anon can delete players" ON public.pelada_players FOR DELETE USING (false);

-- Goalkeepers policies: same as players
CREATE POLICY "Anyone can view goalkeepers" ON public.pelada_goalkeepers FOR SELECT USING (true);
CREATE POLICY "Anyone can add goalkeeper" ON public.pelada_goalkeepers FOR INSERT WITH CHECK (true);
CREATE POLICY "Pelada owner can delete goalkeepers" ON public.pelada_goalkeepers FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.peladas WHERE id = pelada_id AND user_id = auth.uid()));

-- Enable realtime for live updates on public page
ALTER PUBLICATION supabase_realtime ADD TABLE public.pelada_players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pelada_goalkeepers;
