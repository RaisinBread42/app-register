-- Hand-written inverse of drizzle/0003_relational_advisories.sql. Run by hand (psql -f).
-- Roll back newest first: run this before 0002's rollback.
-- Keeps the data: the old `vulnerabilities` text[] and `advisories` jsonb columns are
-- rebuilt from the tables, in the stored order, before the tables are dropped.
-- What does not survive the round trip:
-- - each advisory row's own id and created_at (the old columns had neither);
-- - `url` is rebuilt as the OSV page of the id without percent-encoding (the old
--   code rebuilt the link from the id on every read, so the stored one was never used).
BEGIN;

ALTER TABLE "app_dependencies" ADD COLUMN "vulnerabilities" text[] DEFAULT '{}'::text[] NOT NULL;
ALTER TABLE "app_dependencies" ADD COLUMN "advisories" jsonb DEFAULT '[]'::jsonb NOT NULL;

UPDATE "app_dependencies" d
SET "vulnerabilities" = m.ids
FROM (
  SELECT "dependency_id", array_agg("advisory_id" ORDER BY "position") AS ids
  FROM "dependency_advisories"
  WHERE "source" = 'manual'
  GROUP BY "dependency_id"
) m
WHERE m."dependency_id" = d."id";

UPDATE "app_dependencies" d
SET "advisories" = o.items
FROM (
  SELECT
    a."dependency_id",
    jsonb_agg(
      jsonb_build_object(
        'id', a."advisory_id",
        'aliases', coalesce(
          (SELECT jsonb_agg(al."alias" ORDER BY al."position")
           FROM "dependency_advisory_aliases" al
           WHERE al."advisory_row_id" = a."id"),
          '[]'::jsonb
        ),
        'severity', a."severity",
        'summary', a."summary",
        'url', 'https://osv.dev/vulnerability/' || a."advisory_id"
      )
      ORDER BY a."position"
    ) AS items
  FROM "dependency_advisories" a
  WHERE a."source" = 'osv'
  GROUP BY a."dependency_id"
) o
WHERE o."dependency_id" = d."id";

DROP TABLE IF EXISTS "dependency_advisory_aliases";
DROP TABLE IF EXISTS "dependency_advisories";
ALTER TABLE "app_dependencies" DROP CONSTRAINT IF EXISTS "app_dependencies_id_workspace_unique";

-- Forget the migration (hash = sha256 of 0003_relational_advisories.sql)
-- so `npm run db:migrate` can apply it again.
DELETE FROM "drizzle"."__drizzle_migrations"
WHERE "hash" = 'ab615a5fe7506913c7c0b21485b1aa0925150e189a07729902b3475643127825';

COMMIT;
