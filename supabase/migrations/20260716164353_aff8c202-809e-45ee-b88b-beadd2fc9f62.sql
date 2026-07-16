CREATE TABLE public.custom_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  emoji TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_categories TO authenticated;
GRANT ALL ON public.custom_categories TO service_role;

ALTER TABLE public.custom_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own categories" ON public.custom_categories
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own categories" ON public.custom_categories
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own categories" ON public.custom_categories
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own categories" ON public.custom_categories
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_custom_categories_user_order ON public.custom_categories(user_id, display_order);