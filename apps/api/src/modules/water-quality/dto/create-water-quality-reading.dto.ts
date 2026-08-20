import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsNumber, IsOptional, IsString, MaxLength } from "class-validator";

/**
 * Every metric is optional (a field reading rarely measures all of them at once) — the service
 * layer, not class-validator, enforces that at least one metric is present (an empty reading is
 * a client bug, not a valid record).
 */
export class CreateWaterQualityReadingDto {
  @ApiPropertyOptional({ description: "°C" })
  @IsOptional()
  @IsNumber()
  temperatureC?: number;

  @ApiPropertyOptional({ description: "mg/L" })
  @IsOptional()
  @IsNumber()
  dissolvedOxygenMgL?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  ph?: number;

  @ApiPropertyOptional({ description: "ppt" })
  @IsOptional()
  @IsNumber()
  salinityPpt?: number;

  @ApiPropertyOptional({ description: "mg/L" })
  @IsOptional()
  @IsNumber()
  ammoniaMgL?: number;

  @ApiPropertyOptional({ description: "mg/L" })
  @IsOptional()
  @IsNumber()
  nitriteMgL?: number;

  @ApiPropertyOptional({ description: "mg/L" })
  @IsOptional()
  @IsNumber()
  nitrateMgL?: number;

  @ApiPropertyOptional({ description: "m³/h" })
  @IsOptional()
  @IsNumber()
  flowRateM3H?: number;

  @ApiPropertyOptional({ description: "ISO date/time measured (defaults to now)" })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
