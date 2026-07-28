-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "annotations" JSONB,
ADD COLUMN     "audio" JSONB,
ADD COLUMN     "images" JSONB,
ADD COLUMN     "refusal" TEXT,
ADD COLUMN     "raw" JSONB;

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "request_params" JSONB;
