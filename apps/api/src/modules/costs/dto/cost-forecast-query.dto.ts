import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsNumber, IsOptional, IsPositive, Max, Min } from "class-validator";

export class CostForecastQueryDto {
  @ApiPropertyOptional({ default: 500, description: "Average weight the fish are harvested at, grams" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  targetWeightG?: number;

  @ApiPropertyOptional({ default: 1.3, description: "Feed kg needed per kg of weight gained" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(10)
  targetFcr?: number;

  @ApiPropertyOptional({ default: 95, description: "Share of today's fish expected to reach harvest, %" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  survivalPct?: number;

  @ApiPropertyOptional({ description: "TRY per kg of feed. Omit to use the farm's recent consumption cost." })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  feedPriceTryPerKg?: number;
}
