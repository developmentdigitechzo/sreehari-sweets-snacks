-- Cash on delivery is a real order, not a simulation. Earlier builds flagged every non-online payment
-- as "simulated" with a SIM- reference; clear the flag so admin and the app stop calling them demo.
UPDATE "Payment" SET "simulated" = false, "provider" = 'cash' WHERE "method" = 'COD' AND "simulated" = true;
UPDATE "Payment" SET "reference" = regexp_replace("reference", '^SIM-', 'COD-') WHERE "method" = 'COD' AND "reference" LIKE 'SIM-%';

-- Store times in UTC (the API writes UTC; a non-UTC database default only matters for raw SQL).
-- Needs the migration user to own the database; if it does not, skip quietly and report it in Settings > System check.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO ''UTC''', current_database());
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not set the database time zone to UTC: %', SQLERRM;
END
$$;
