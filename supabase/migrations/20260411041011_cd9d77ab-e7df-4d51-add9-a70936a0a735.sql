ALTER TABLE public.debt_additions ADD COLUMN wallet_id uuid REFERENCES public.wallets(id);
