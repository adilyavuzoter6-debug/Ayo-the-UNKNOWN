import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

/** Creates a FishBatch and its opening STOCKING BatchMovement atomically. */
export class CreateFishBatchDto {
  @ApiProperty()
  @IsString()
  speciesId!: string;

  @ApiProperty({ example: "LOT-2026-00125" })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  lotCode!: string;

  @ApiProperty({ description: "Tank the batch is stocked into" })
  @IsString()
  tankId!: string;

  @ApiProperty({ example: 5000 })
  @IsInt()
  @IsPositive()
  fishCount!: number;

  @ApiProperty({ description: "Average weight per fish in grams", example: 120 })
  @IsNumber()
  @IsPositive()
  avgWeightG!: number;

  @ApiProperty({ description: "ISO date the batch entered the farm" })
  @IsDateString()
  farmEntryDate!: string;

  @ApiPropertyOptional({ description: "ISO date the batch hatched" })
  @IsOptional()
  @IsDateString()
  hatchDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  hatcherySupplier?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  eggSource?: string;

  @ApiPropertyOptional({
    enum: ["FINGERLINGS_PURCHASED", "EGGS_PURCHASED", "EGGS_IN_HOUSE"],
    description: "Where the fish came from, when its price is recorded",
  })
  @IsOptional()
  @IsIn(["FINGERLINGS_PURCHASED", "EGGS_PURCHASED", "EGGS_IN_HOUSE"])
  stockingSource?: "FINGERLINGS_PURCHASED" | "EGGS_PURCHASED" | "EGGS_IN_HOUSE";

  @ApiPropertyOptional({ description: "Eggs stocked from (EGGS_* sources only)" })
  @IsOptional()
  @IsInt()
  @IsPositive()
  eggCount?: number;

  @ApiPropertyOptional({
    description:
      "Price per fish (FINGERLINGS_PURCHASED) or per egg (EGGS_*), in stockingCurrency. Optional for EGGS_IN_HOUSE.",
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  stockingUnitPrice?: number;

  @ApiPropertyOptional({ enum: ["TRY", "USD", "EUR"], description: "Defaults to TRY" })
  @IsOptional()
  @IsIn(["TRY", "USD", "EUR"])
  stockingCurrency?: "TRY" | "USD" | "EUR";

  @ApiPropertyOptional({ description: "TRY per unit of stockingCurrency; omit to use the Central Bank rate" })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  stockingExchangeRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
