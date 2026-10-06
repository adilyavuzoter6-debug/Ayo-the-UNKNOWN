import { ApiPropertyOptional } from "@nestjs/swagger";
import { CostCategory } from "@prisma/client";
import { IsDateString, IsEnum, IsIn, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from "class-validator";

/** Every field optional: a correction changes only what it names. */
export class UpdateCostEntryDto {
  @ApiPropertyOptional({ enum: CostCategory })
  @IsOptional()
  @IsEnum(CostCategory)
  category?: CostCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;

  @ApiPropertyOptional({ enum: ["TRY", "USD", "EUR"] })
  @IsOptional()
  @IsIn(["TRY", "USD", "EUR"])
  currency?: "TRY" | "USD" | "EUR";

  @ApiPropertyOptional({ description: "TRY per unit of currency; omit to keep or re-look-up the rate" })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  exchangeRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  incurredAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
