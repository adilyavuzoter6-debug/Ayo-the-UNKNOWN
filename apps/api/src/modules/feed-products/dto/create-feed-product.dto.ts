import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNumber, IsOptional, IsPositive, IsString, MaxLength, MinLength } from "class-validator";

export class CreateFeedProductDto {
  @ApiProperty({ example: "Skretting Nutra Olympic 6mm" })
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({ example: "Skretting" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  manufacturer?: string;

  @ApiPropertyOptional({ description: "Pellet size in millimeters" })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  pelletSizeMm?: number;

  @ApiPropertyOptional({ description: "Protein percentage" })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  proteinPct?: number;

  @ApiPropertyOptional({ description: "Fat percentage" })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  fatPct?: number;
}
