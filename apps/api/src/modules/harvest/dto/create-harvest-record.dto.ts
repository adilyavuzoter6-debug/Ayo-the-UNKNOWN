import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { HarvestFullness, HarvestType } from "@prisma/client";
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from "class-validator";

/**
 * Shape covers both PLANNED and ACTUAL — the service, not class-validator, enforces which
 * fields apply to which type (plannedDate for PLANNED; fishCount required for an ACTUAL+PARTIAL
 * harvest, auto-computed from the tank's live count for ACTUAL+FULL when omitted), same pattern
 * as CreateWeightSampleDto's sampleMethod branch.
 */
export class CreateHarvestRecordDto {
  @ApiProperty({ description: "The fish batch being harvested" })
  @IsString()
  batchId!: string;

  @ApiProperty({ enum: HarvestType })
  @IsEnum(HarvestType)
  type!: HarvestType;

  @ApiProperty({ enum: HarvestFullness })
  @IsEnum(HarvestFullness)
  fullness!: HarvestFullness;

  @ApiPropertyOptional({ description: "Required for type: PLANNED" })
  @IsOptional()
  @IsDateString()
  plannedDate?: string;

  @ApiPropertyOptional({ description: "ISO date/time harvested (defaults to now, ACTUAL only)" })
  @IsOptional()
  @IsDateString()
  harvestedAt?: string;

  @ApiPropertyOptional({
    description: "Required for fullness: PARTIAL; auto-computed from the live tank count for FULL",
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  fishCount?: number;

  @ApiPropertyOptional({ description: "Overrides the batch's current average weight if provided" })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  avgWeightG?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sizeGrade?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  destination?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  customer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  processingPlant?: string;

  @ApiPropertyOptional({ description: "ACTUAL only. Sale price per kg, in saleCurrency." })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  salePricePerKg?: number;

  @ApiPropertyOptional({ enum: ["TRY", "USD"], description: "Defaults to TRY" })
  @IsOptional()
  @IsIn(["TRY", "USD"])
  saleCurrency?: "TRY" | "USD";

  @ApiPropertyOptional({
    description:
      "TRY per 1 USD. Omit to use the Central Bank rate for harvestedAt; ignored for TRY sales.",
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  saleExchangeRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
