/*
  Warnings:

  - You are about to drop the column `webauthnUserID` on the `passkeys` table. All the data in the column will be lost.
  - Added the required column `credentialID` to the `passkeys` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."passkeys" DROP COLUMN "webauthnUserID",
ADD COLUMN     "aaguid" TEXT,
ADD COLUMN     "credentialID" TEXT NOT NULL;
