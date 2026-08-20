import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateFishSpeciesDto {
  @ApiProperty({ example: "Atlantic Salmon" })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ example: "AquaGen" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  strain?: string;
}
