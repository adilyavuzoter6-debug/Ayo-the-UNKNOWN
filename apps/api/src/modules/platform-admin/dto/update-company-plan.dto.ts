import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PLAN_TIERS, type PlanTier } from "@aquai/types";
import { IsDateString, IsIn, IsOptional } from "class-validator";

export class UpdateCompanyPlanDto {
  @ApiProperty({ enum: PLAN_TIERS })
  @IsIn(PLAN_TIERS)
  planTier!: PlanTier;

  /** For a TRIAL: when it ends. Ignored for paid plans, which don't expire on their own. */
  @ApiPropertyOptional({ example: "2026-12-31" })
  @IsOptional()
  @IsDateString()
  trialEndsAt?: string;
}
