-- P0 hygiene: every user-owned table references auth.users with ON DELETE CASCADE.
--
-- Seven tables were created with a bare `user_id uuid NOT NULL`, so deleting an
-- auth user left orphaned financial rows behind. For each table this migration:
--   1. reports how many orphaned rows exist (user_id not in auth.users),
--   2. deletes them (they belong to users that no longer exist; approved for this project),
--   3. adds the foreign key, unless it already exists.
-- It is idempotent, so it is safe if it is applied again (e.g. by the GitHub integration).

DO $$
DECLARE
  t text;
  orphan_count bigint;
  constraint_name text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'debt_additions',
    'debt_payments',
    'debts',
    'monthly_snapshots',
    'recurring_transactions',
    'savings_goals',
    'custom_categories'
  ]
  LOOP
    constraint_name := t || '_user_id_fkey';

    EXECUTE format(
      'SELECT count(*) FROM public.%I x WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = x.user_id)',
      t
    ) INTO orphan_count;
    RAISE NOTICE '%: % orphaned row(s) without an auth user', t, orphan_count;

    IF orphan_count > 0 THEN
      EXECUTE format(
        'DELETE FROM public.%I x WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = x.user_id)',
        t
      );
      RAISE NOTICE '%: deleted % orphaned row(s)', t, orphan_count;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class r ON r.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = r.relnamespace
      WHERE n.nspname = 'public' AND r.relname = t AND c.conname = constraint_name
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE',
        t,
        constraint_name
      );
      RAISE NOTICE '%: added %', t, constraint_name;
    ELSE
      RAISE NOTICE '%: % already present', t, constraint_name;
    END IF;
  END LOOP;
END $$;
