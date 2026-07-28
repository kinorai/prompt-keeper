-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "tool_calls" JSONB,
ADD COLUMN     "tool_call_id" TEXT,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "reasoning_content" TEXT,
ADD COLUMN     "thinking_blocks" JSONB;
