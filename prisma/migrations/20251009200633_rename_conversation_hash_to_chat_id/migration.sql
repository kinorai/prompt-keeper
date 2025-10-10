/*
  Warnings:

  - You are about to drop the column `conversation_hash` on the `conversations` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[chat_id]` on the table `conversations` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."conversations_conversation_hash_idx";

-- AlterTable
ALTER TABLE "public"."conversations" DROP COLUMN "conversation_hash",
ADD COLUMN     "chat_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "conversations_chat_id_key" ON "public"."conversations"("chat_id");

-- CreateIndex
CREATE INDEX "conversations_chat_id_idx" ON "public"."conversations"("chat_id");
