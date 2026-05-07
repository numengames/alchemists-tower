-- Track partial-failure state on worlds so the operator can see what step
-- broke and purge the orphan rows from the dashboard.
ALTER TABLE "worlds"
    ADD COLUMN "failure_step" TEXT,
    ADD COLUMN "failure_reason" TEXT;
