-- AlterTable
ALTER TABLE "outbox_events" ADD COLUMN     "dead_lettered_at" TIMESTAMP(3),
ADD COLUMN     "last_error" TEXT;
