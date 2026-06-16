-- World backup jobs: async, pg-boss-backed jobs that export a world (Postgres
-- state + S3 assets) into a downloadable zip. Backed by lib/backup/*.

-- CreateEnum
CREATE TYPE "BackupStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "backup_jobs" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "world" TEXT NOT NULL,
    "environment" "Environment" NOT NULL,
    "status" "BackupStatus" NOT NULL DEFAULT 'QUEUED',
    "object_key" TEXT,
    "size_bytes" BIGINT,
    "asset_files" INTEGER,
    "db_rows" JSONB,
    "error_step" TEXT,
    "error_reason" TEXT,
    "requested_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "backup_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "backup_jobs_organization_world_environment_idx" ON "backup_jobs"("organization", "world", "environment");

-- CreateIndex
CREATE INDEX "backup_jobs_status_idx" ON "backup_jobs"("status");
