import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { SampleMethod } from "@prisma/client";
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from "class-validator";

/**
 * Shape covers both sampleMethod variants — the service, not class-validator, enforces which
 * fields are required for which method (individualWeightsG for INDIVIDUAL; avgWeightG +
 * sampleSize for AGGREGATE), since class-validator's conditional-field support is awkward for a
 * two-way branch like this.
 */
export class CreateWeightSampleDto {
  @ApiProperty({ description: "The fish batch this sample was taken from" })
  @IsString()
  batchId!: string;

  @ApiProperty({ enum: SampleMethod })
  @IsEnum(SampleMethod)
  sampleMethod!: SampleMethod;

  @ApiPropertyOptional({
    description: "Required for sampleMethod: INDIVIDUAL — one weight per fish, in grams",
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsNumber({}, { each: true })
  individualWeightsG?: number[];

  @ApiPropertyOptional({ description: "Required for sampleMethod: AGGREGATE" })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  avgWeightG?: number;

  @ApiPropertyOptional({ description: "Required for sampleMethod: AGGREGATE" })
  @IsOptional()
  @IsInt()
  @IsPositive()
  sampleSize?: number;

  @ApiPropertyOptional({ description: "ISO date/time sampled (defaults to now)" })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
