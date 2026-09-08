import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";

export class UpdateFishSpeciesDto {
  @ApiPropertyOptional({ example: "Atlantic Salmon" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: "AquaGen" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  strain?: string;

  @ApiPropertyOptional({ description: "Critical low dissolved oxygen (mg/L).", example: 6.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  criticalDoMgL?: number;

  @ApiPropertyOptional({ description: "Critical low pH.", example: 6.0 })
  @IsOptional()
  @IsNumber()
  criticalPhLow?: number;

  @ApiPropertyOptional({ description: "Critical high pH.", example: 9.0 })
  @IsOptional()
  @IsNumber()
  criticalPhHigh?: number;

  @ApiPropertyOptional({ description: "Critical high temperature (°C).", example: 22.0 })
  @IsOptional()
  @IsNumber()
  criticalTempHighC?: number;
}
