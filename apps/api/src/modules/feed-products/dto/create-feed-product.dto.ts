import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNumber, IsOptional, IsPositive, IsString, MaxLength, MinLength } from "class-validator";

export class CreateFeedProductDto {
  @ApiProperty({ example: "Özpekler 45/20 5mm" })
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({ example: "Özpekler" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  manufacturer?: string;

  @ApiPropertyOptional({
    description: "Pellet size, free text so a range (e.g. 0.3-0.5) or a single size (4) both work",
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  pelletSizeMm?: string;

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

export class UpdateFeedProductDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  manufacturer?: string;

  @ApiPropertyOptional({
    description: "Pellet size, free text so a range (e.g. 0.3-0.5) or a single size (4) both work",
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  pelletSizeMm?: string;

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
