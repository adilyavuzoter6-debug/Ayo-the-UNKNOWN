import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { CostCategory } from "@prisma/client";
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from "class-validator";

export class CreateCostEntryDto {
  @ApiProperty({ enum: CostCategory })
  @IsEnum(CostCategory)
  category!: CostCategory;

  @ApiProperty({ description: "Amount in `currency`, as entered" })
  @IsNumber()
  @IsPositive()
  amount!: number;

  @ApiPropertyOptional({ enum: ["TRY", "USD", "EUR"], description: "Defaults to TRY" })
  @IsOptional()
  @IsIn(["TRY", "USD", "EUR"])
  currency?: "TRY" | "USD" | "EUR";

  @ApiPropertyOptional({
    description:
      "TRY per 1 USD. Omit to use the Central Bank rate for incurredAt; ignored for TRY entries.",
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  exchangeRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tankId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  batchId?: string;

  @ApiProperty({ description: "ISO date the cost was incurred" })
  @IsDateString()
  incurredAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
