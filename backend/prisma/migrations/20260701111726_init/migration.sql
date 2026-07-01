-- CreateEnum
CREATE TYPE "RiskProfile" AS ENUM ('Conservative', 'Moderate', 'Aggressive');

-- CreateEnum
CREATE TYPE "PriceSource" AS ENUM ('keeper', 'manual_override');

-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('user', 'agent');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Questionnaire" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "questions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Questionnaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Answer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionnaireId" TEXT,
    "answers" JSONB NOT NULL,
    "demographics" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profile" "RiskProfile" NOT NULL,
    "reasoning" TEXT NOT NULL,
    "score" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioMeta" (
    "id" TEXT NOT NULL,
    "vaultHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "profile" "RiskProfile" NOT NULL,
    "baseAllocation" JSONB NOT NULL,
    "targetAmountUsd" DECIMAL(38,6) NOT NULL,
    "targetYear" INTEGER NOT NULL,
    "createdYear" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioMeta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RebalanceLog" (
    "id" TEXT NOT NULL,
    "vaultHash" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "preWeights" JSONB NOT NULL,
    "postWeights" JSONB NOT NULL,
    "swaps" JSONB NOT NULL,
    "rationale" TEXT NOT NULL,
    "x402Receipt" TEXT,

    CONSTRAINT "RebalanceLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceLog" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "price" DECIMAL(38,6) NOT NULL,
    "source" "PriceSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "vaultHash" TEXT NOT NULL,
    "role" "ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectionCache" (
    "id" TEXT NOT NULL,
    "vaultHash" TEXT NOT NULL,
    "requiredMonthlyUsd" DECIMAL(38,6) NOT NULL,
    "onTrack" BOOLEAN NOT NULL,
    "returnAssumptionBps" INTEGER NOT NULL,
    "yearsLeft" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectionCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioMeta_vaultHash_key" ON "PortfolioMeta"("vaultHash");

-- CreateIndex
CREATE INDEX "RebalanceLog_vaultHash_timestamp_idx" ON "RebalanceLog"("vaultHash", "timestamp");

-- CreateIndex
CREATE INDEX "PriceLog_token_createdAt_idx" ON "PriceLog"("token", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_vaultHash_createdAt_idx" ON "ChatMessage"("vaultHash", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectionCache_vaultHash_key" ON "ProjectionCache"("vaultHash");

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_questionnaireId_fkey" FOREIGN KEY ("questionnaireId") REFERENCES "Questionnaire"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioMeta" ADD CONSTRAINT "PortfolioMeta_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebalanceLog" ADD CONSTRAINT "RebalanceLog_vaultHash_fkey" FOREIGN KEY ("vaultHash") REFERENCES "PortfolioMeta"("vaultHash") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_vaultHash_fkey" FOREIGN KEY ("vaultHash") REFERENCES "PortfolioMeta"("vaultHash") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectionCache" ADD CONSTRAINT "ProjectionCache_vaultHash_fkey" FOREIGN KEY ("vaultHash") REFERENCES "PortfolioMeta"("vaultHash") ON DELETE RESTRICT ON UPDATE CASCADE;
