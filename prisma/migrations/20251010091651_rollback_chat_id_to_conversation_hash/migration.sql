/*
  Warnings:

  - You are about to drop the column `chat_id` on the `conversations` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "public"."conversations_chat_id_idx";

-- DropIndex
DROP INDEX "public"."conversations_chat_id_key";

-- AlterTable
ALTER TABLE "public"."conversations" DROP COLUMN "chat_id",
ADD COLUMN     "conversation_hash" TEXT;

-- CreateIndex
CREATE INDEX "conversations_conversation_hash_idx" ON "public"."conversations"("conversation_hash");
