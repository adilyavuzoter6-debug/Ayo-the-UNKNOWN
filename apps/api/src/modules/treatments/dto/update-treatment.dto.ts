import { ApiPropertyOptional } from "@nestjs/swagger";
import { TreatmentType } from "@prisma/client";
import { IsDateString, IsEnum, IsInt, IsOptional, IsPositive, IsString, MaxLength } from "class-validator";

/**
 * Every field optional — a correction names only what changed. A nullable field (dosage, withdrawal
 * period, end date, notes) is cleared by sending null. The batch and tank a treatment belongs to are
 * fixed: moving a dose to another batch would rewrite the withdrawal history of both.
 */
export class UpdateTreatmentDto {
  @ApiPropertyOptional({ enum: TreatmentType })
  @IsOptional()
  @IsEnum(TreatmentType)
  type?: TreatmentType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  productName?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  dosage?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @IsPositive()
  withdrawalPeriodDays?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  endedAt?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}
