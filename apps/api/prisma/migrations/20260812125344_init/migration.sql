-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('TRIAL', 'STANDARD', 'PROFESSIONAL', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PLATFORM_ADMIN', 'COMPANY_OWNER', 'GENERAL_MANAGER', 'FARM_MANAGER', 'VETERINARIAN', 'FEED_MANAGER', 'ACCOUNTANT', 'WORKER', 'READ_ONLY');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "FarmStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "TankType" AS ENUM ('TANK', 'POND', 'CAGE', 'RACEWAY');

-- CreateEnum
CREATE TYPE "TankStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "countryCode" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "planTier" "PlanTier" NOT NULL DEFAULT 'TRIAL',
    "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "authProviderId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_memberships" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "invitedAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_farm_scopes" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,

    CONSTRAINT "membership_farm_scopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farms" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "timezone" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "status" "FarmStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "farms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farm_sections" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "farm_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tanks" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "farmSectionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "TankType" NOT NULL,
    "volumeM3" DECIMAL(10,2),
    "maxBiomassKg" DECIMAL(12,2),
    "qrToken" TEXT NOT NULL,
    "status" "TankStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tanks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "token" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "previousValue" JSONB,
    "newValue" JSONB,
    "ipAddress" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_authProviderId_key" ON "users"("authProviderId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "company_memberships_companyId_idx" ON "company_memberships"("companyId");

-- CreateIndex
CREATE INDEX "company_memberships_userId_idx" ON "company_memberships"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "company_memberships_companyId_userId_key" ON "company_memberships"("companyId", "userId");

-- CreateIndex
CREATE INDEX "membership_farm_scopes_farmId_idx" ON "membership_farm_scopes"("farmId");

-- CreateIndex
CREATE UNIQUE INDEX "membership_farm_scopes_membershipId_farmId_key" ON "membership_farm_scopes"("membershipId", "farmId");

-- CreateIndex
CREATE INDEX "farms_companyId_idx" ON "farms"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "farms_companyId_code_key" ON "farms"("companyId", "code");

-- CreateIndex
CREATE INDEX "farm_sections_companyId_farmId_idx" ON "farm_sections"("companyId", "farmId");

-- CreateIndex
CREATE UNIQUE INDEX "tanks_qrToken_key" ON "tanks"("qrToken");

-- CreateIndex
CREATE INDEX "tanks_companyId_idx" ON "tanks"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "tanks_companyId_farmSectionId_code_key" ON "tanks"("companyId", "farmSectionId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_key" ON "invitations"("token");

-- CreateIndex
CREATE INDEX "invitations_companyId_email_idx" ON "invitations"("companyId", "email");

-- CreateIndex
CREATE INDEX "invitations_token_idx" ON "invitations"("token");

-- CreateIndex
CREATE INDEX "audit_logs_companyId_entityType_entityId_idx" ON "audit_logs"("companyId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_companyId_occurredAt_idx" ON "audit_logs"("companyId", "occurredAt");

-- AddForeignKey
ALTER TABLE "company_memberships" ADD CONSTRAINT "company_memberships_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_memberships" ADD CONSTRAINT "company_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_farm_scopes" ADD CONSTRAINT "membership_farm_scopes_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "company_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_farm_scopes" ADD CONSTRAINT "membership_farm_scopes_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farms" ADD CONSTRAINT "farms_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_sections" ADD CONSTRAINT "farm_sections_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tanks" ADD CONSTRAINT "tanks_farmSectionId_fkey" FOREIGN KEY ("farmSectionId") REFERENCES "farm_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
