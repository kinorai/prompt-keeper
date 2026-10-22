-- AlterTable
ALTER TABLE "outbox_events" ADD COLUMN     "next_attempt_at" TIMESTAMP(3),
ADD COLUMN     "rejected_attempts" INTEGER NOT NULL DEFAULT 0;
