import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { CostCategory } from "@prisma/client";
import { IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from "class-validator";

export class CreateCostEntryDto {
  @ApiProperty({ enum: CostCategory })
  @IsEnum(CostCategory)
  category!: CostCategory;

  @ApiProperty()
  @IsNumber()
  @IsPositive()
  amount!: number;

  @ApiPropertyOptional({ description: "ISO 4217 currency code, defaults to TRY" })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

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
