-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('CRASH_LOOP', 'HIGH_CPU', 'HIGH_MEMORY', 'DEPLOYMENT_FAILED', 'NODE_NOT_READY');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "MetricSnapshot" (
    "id" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "nodeName" TEXT,
    "cpuUsage" DOUBLE PRECISION NOT NULL,
    "memoryUsage" DOUBLE PRECISION NOT NULL,
    "podCount" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "severity" "Severity" NOT NULL,
    "namespace" TEXT NOT NULL,
    "resourceName" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MetricSnapshot_namespace_idx" ON "MetricSnapshot"("namespace");

-- CreateIndex
CREATE INDEX "MetricSnapshot_recordedAt_idx" ON "MetricSnapshot"("recordedAt");

-- CreateIndex
CREATE INDEX "Alert_resolved_idx" ON "Alert"("resolved");

-- CreateIndex
CREATE INDEX "Alert_namespace_idx" ON "Alert"("namespace");

-- CreateIndex
CREATE INDEX "Alert_createdAt_idx" ON "Alert"("createdAt");
