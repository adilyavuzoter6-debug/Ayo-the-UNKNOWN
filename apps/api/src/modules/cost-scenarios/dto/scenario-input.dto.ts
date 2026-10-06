import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";

/**
 * Every number is optional at the transport layer: a missing value is a question for the engine, which
 * refuses it with a message in the user's language rather than letting class-validator guess.
 */
export class ExpenseDto {
  @IsString()
  @MaxLength(100)
  label!: string;

  @IsNumber()
  amountTry!: number;

  @IsIn(["TOTAL", "DAILY"])
  mode!: "TOTAL" | "DAILY";
}

export class StageDto {
  @IsOptional()
  @IsNumber()
  minG?: number;

  @IsOptional()
  @IsNumber()
  maxG?: number;

  @IsOptional()
  @IsNumber()
  feedPriceTryPerKg?: number;

  @IsOptional()
  @IsNumber()
  fcr?: number;

  @IsOptional()
  @IsNumber()
  durationDays?: number;

  @ApiPropertyOptional({ description: "STAGED mode: used when durationDays is not given" })
  @IsOptional()
  @IsNumber()
  sgrPctPerDay?: number;

  @IsOptional()
  @IsNumber()
  mortalityPct?: number;
}

export class ScenarioInputDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  startCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  startAvgWeightG?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  startAccumulatedCostTry?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  targetWeightG?: number;

  @IsIn(["SIMPLE", "STAGED"])
  mode!: "SIMPLE" | "STAGED";

  @ApiPropertyOptional({ description: "SIMPLE mode" })
  @IsOptional()
  @IsNumber()
  feedPriceTryPerKg?: number;

  @ApiPropertyOptional({ description: "SIMPLE mode" })
  @IsOptional()
  @IsNumber()
  fcr?: number;

  @ApiPropertyOptional({ description: "SIMPLE mode" })
  @IsOptional()
  @IsNumber()
  durationDays?: number;

  @ApiPropertyOptional({ description: "SIMPLE mode, when durationDays is not given: specific growth rate, %/day" })
  @IsOptional()
  @IsNumber()
  sgrPctPerDay?: number;

  @ApiPropertyOptional({ description: "SIMPLE mode: total mortality over the whole period" })
  @IsOptional()
  @IsNumber()
  mortalityPct?: number;

  @ApiPropertyOptional({ type: [StageDto], description: "STAGED mode" })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StageDto)
  stages?: StageDto[];

  @ApiPropertyOptional({ type: [ExpenseDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExpenseDto)
  expenses?: ExpenseDto[];
}

export class CalculateScenariosDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => ScenarioInputDto)
  scenarios!: ScenarioInputDto[];
}

export class WeightRangeDto {
  @IsNumber()
  minG!: number;

  @IsNumber()
  maxG!: number;
}

export class GrowthProfileDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => WeightRangeDto)
  ranges!: WeightRangeDto[];
}

export class SaveScenarioDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  batchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tankId?: string;

  @ValidateNested()
  @Type(() => ScenarioInputDto)
  scenario!: ScenarioInputDto;
}
