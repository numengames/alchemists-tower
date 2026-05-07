-- Phase 2 (Create world) — schema migration
--
-- This migration:
--   1. Drops the legacy DEVELOPMENT/STAGING/PRODUCTION values from `Environment`
--      and replaces them with PRE/PRO (the real infra terminology).
--   2. Adds the new `WorldStatus` enum.
--   3. Refactors `worlds`: drops mock-only fields (k8s_cluster_name, rds_host,
--      rds_schema, s3_bucket_assets, git_repo_url, version), adds the fields
--      the create/delete flow actually needs, makes `owner_id` optional, and
--      replaces the global UNIQUE on (name) and (slug) with a composite
--      UNIQUE on (organization, slug, environment) so the same world name
--      can co-exist across orgs and across pre/pro.
--
-- Pre-condition: in the running DB, only seed/mock rows exist (project notes
-- confirm the table has never held real data). If real rows exist, do not
-- run this migration without first archiving them — the new NOT NULL
-- columns (organization, helmrelease_name, k8s_namespace, hostname) cannot
-- be back-filled automatically.

-- =============================================================
-- 1. Wipe seed/mock data so we can reshape the table cleanly.
--    (This is also why audit_logs world_id is ON DELETE SET NULL.)
-- =============================================================
DELETE FROM "audit_logs" WHERE "world_id" IS NOT NULL;
DELETE FROM "worlds";

-- =============================================================
-- 2. Replace Environment enum.
-- =============================================================
ALTER TABLE "worlds" DROP COLUMN "environment";
DROP TYPE "Environment";
CREATE TYPE "Environment" AS ENUM ('PRE', 'PRO');

-- =============================================================
-- 3. Create WorldStatus enum.
-- =============================================================
CREATE TYPE "WorldStatus" AS ENUM ('PROVISIONING', 'ACTIVE', 'DELETING', 'FAILED');

-- =============================================================
-- 4. Drop legacy mock-only columns and indexes.
-- =============================================================
DROP INDEX IF EXISTS "worlds_name_key";
DROP INDEX IF EXISTS "worlds_slug_key";

ALTER TABLE "worlds"
    DROP COLUMN IF EXISTS "k8s_namespace",
    DROP COLUMN IF EXISTS "k8s_cluster_name",
    DROP COLUMN IF EXISTS "rds_host",
    DROP COLUMN IF EXISTS "rds_schema",
    DROP COLUMN IF EXISTS "s3_bucket_assets",
    DROP COLUMN IF EXISTS "git_repo_url",
    DROP COLUMN IF EXISTS "version";

-- =============================================================
-- 5. Re-add columns in the new shape.
-- =============================================================
ALTER TABLE "worlds"
    ADD COLUMN "environment" "Environment" NOT NULL,
    ADD COLUMN "status" "WorldStatus" NOT NULL DEFAULT 'PROVISIONING',
    ADD COLUMN "organization" TEXT NOT NULL,
    ADD COLUMN "helmrelease_name" TEXT NOT NULL,
    ADD COLUMN "k8s_namespace" TEXT NOT NULL,
    ADD COLUMN "hostname" TEXT NOT NULL,
    ADD COLUMN "template_version" TEXT,
    ADD COLUMN "github_pr_url" TEXT,
    ADD COLUMN "github_pr_number" INTEGER;

-- =============================================================
-- 6. Make owner_id optional (legacy worlds imported from k8s have no owner).
--    Drop and re-create the FK so we can switch to ON DELETE SET NULL.
-- =============================================================
ALTER TABLE "worlds" DROP CONSTRAINT IF EXISTS "worlds_owner_id_fkey";
ALTER TABLE "worlds" ALTER COLUMN "owner_id" DROP NOT NULL;
ALTER TABLE "worlds"
    ADD CONSTRAINT "worlds_owner_id_fkey"
    FOREIGN KEY ("owner_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================
-- 7. New uniqueness + indexes.
-- =============================================================
CREATE UNIQUE INDEX "worlds_organization_slug_environment_key"
    ON "worlds" ("organization", "slug", "environment");
CREATE INDEX "worlds_organization_environment_idx"
    ON "worlds" ("organization", "environment");
CREATE INDEX "worlds_status_idx" ON "worlds" ("status");
