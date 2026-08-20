import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { MortalityReason } from "@prisma/client";
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from "class-validator";

export class CreateMortalityEventDto {
  @ApiProperty({ description: "The fish batch this mortality is reported against" })
  @IsString()
  batchId!: string;

  @ApiProperty({ example: 12 })
  @IsInt()
  @IsPositive()
  fishCount!: number;

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
