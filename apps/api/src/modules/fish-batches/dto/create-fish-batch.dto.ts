import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsDateString,
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
