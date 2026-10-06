import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { MortalityReason } from "@prisma/client";
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from "class-validator";

export class CreateMortalityEventDto {
  @ApiProperty({ description: "The fish batch this mortality is reported against" })
  @IsString()
  batchId!: string;

  @ApiPropertyOptional({
    example: 12,
    description: "Number of dead fish. Exactly one of fishCount or totalWeightG is required.",
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  fishCount?: number;

  @ApiPropertyOptional({
    example: 450,
    description:
      "Total weight of the dead fish in grams; converted to a count using the batch's average weight at the time of death.",
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  totalWeightG?: number;

  @ApiProperty({ enum: MortalityReason })
  @IsEnum(MortalityReason)
  reason!: MortalityReason;

  @ApiPropertyOptional({ description: "ISO date/time observed (defaults to now)" })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
