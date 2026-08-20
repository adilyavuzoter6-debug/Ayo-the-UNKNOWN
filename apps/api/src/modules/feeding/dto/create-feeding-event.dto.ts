import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { FeedingMethod } from "@prisma/client";
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from "class-validator";

export class CreateFeedingEventDto {
  @ApiProperty({ description: "The fish batch being fed" })
  @IsString()
  batchId!: string;

  @ApiProperty({ description: "Which delivered lot the feed is drawn from" })
  @IsString()
  feedInventoryBatchId!: string;

  @ApiProperty({ example: 45.5, description: "Amount fed, in kilograms" })
  @IsNumber()
  @IsPositive()
  quantityKg!: number;

  @ApiPropertyOptional({ enum: FeedingMethod })
  @IsOptional()
  @IsEnum(FeedingMethod)
  method?: FeedingMethod;

  @ApiPropertyOptional({ description: "ISO date/time the feeding happened (defaults to now)" })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
