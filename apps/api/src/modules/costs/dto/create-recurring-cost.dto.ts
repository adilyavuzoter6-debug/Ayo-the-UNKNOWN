import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { CostCategory } from "@prisma/client";
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class CreateRecurringCostDto {
  @ApiProperty({ enum: CostCategory })
  @IsEnum(CostCategory)
  category!: CostCategory;

  @ApiProperty({ description: "Amount per month, in `currency`" })
  @IsNumber()
  @IsPositive()
  amount!: number;

  @ApiPropertyOptional({ enum: ["TRY", "USD", "EUR"], description: "Defaults to TRY" })
  @IsOptional()
  @IsIn(["TRY", "USD", "EUR"])
  currency?: "TRY" | "USD" | "EUR";

  @ApiProperty({ minimum: 1, maximum: 28, description: "Day of each month it's booked on" })
  @IsInt()
  @Min(1)
  @Max(28)
  dayOfMonth!: number;

  @ApiProperty({ description: "ISO date of the first occurrence; earlier months are never booked" })
  @IsDateString()
  startDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
