import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { TreatmentType } from "@prisma/client";
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from "class-validator";

export class CreateTreatmentDto {
  @ApiProperty({ description: "The fish batch being treated" })
  @IsString()
  batchId!: string;

  @ApiProperty({ enum: TreatmentType })
  @IsEnum(TreatmentType)
  type!: TreatmentType;

  @ApiProperty({ description: 'e.g. "Florfenicol 20%"' })
  @IsString()
  @MaxLength(200)
  productName!: string;

  @ApiPropertyOptional({ description: 'e.g. "10 mg/kg biomass, once daily"' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  dosage?: string;

  @ApiPropertyOptional({
    description: "Days after the last dose before the batch may legally be harvested",
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  withdrawalPeriodDays?: number;

  @ApiProperty({ description: "ISO date the treatment started" })
  @IsDateString()
  startedAt!: string;

  @ApiPropertyOptional({ description: "ISO date the treatment ended (last dose); omit if ongoing" })
  @IsOptional()
  @IsDateString()
  endedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  veterinarianId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
