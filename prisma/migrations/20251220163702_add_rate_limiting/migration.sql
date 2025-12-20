-- AlterTable
ALTER TABLE "users" ADD COLUMN     "last_failed_attempt" TIMESTAMP(3),
ADD COLUMN     "locked_until" TIMESTAMP(3),
ADD COLUMN     "login_attempts" INTEGER NOT NULL DEFAULT 0;
