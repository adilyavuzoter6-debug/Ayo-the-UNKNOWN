import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsOptional } from "class-validator";

/**
 * Both bounds optional — omitting them returns the batch's full chronological SGR series (every
 * consecutive WeightSample pair), which is what the growth-curve chart needs; passing either
 * bound restricts the series to samples within that window.
 */
export class SgrQueryDto {
  @ApiPropertyOptional({ description: "Only include samples on/after this date" })
  @IsOptional()
  @IsDateString()
  periodStart?: string;

  @ApiPropertyOptional({ description: "Only include samples on/before this date" })
  @IsOptional()
  @IsDateString()
  periodEnd?: string;
}
