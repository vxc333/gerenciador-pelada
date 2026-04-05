-- Add draw_done_by to peladas so we know who executed the draw
ALTER TABLE public.peladas
ADD COLUMN IF NOT EXISTS draw_done_by text;

-- No default value; nullable. Application will set this when performing the draw.
