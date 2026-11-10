-- Password reset now uses Supabase Auth (resetPasswordForEmail + updateUser),
-- which manages its own one-time tokens. The custom send-reset-email /
-- verify-reset-token Edge Functions and their token table are removed.
DROP TABLE IF EXISTS public.password_reset_tokens;
