import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { TankType } from "@prisma/client";
import { IsEnum, IsNumber, IsOptional, IsPositive, IsString, MaxLength, MinLength } from "class-validator";

export class CreateTankDto {
  @ApiProperty({ example: "A12" })
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  code!: string;

  @ApiProperty({ enum: TankType })
  @IsEnum(TankType)
  type!: TankType;

  @ApiPropertyOptional({ description: "Volume in cubic meters" })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  volumeM3?: number;

  @ApiPropertyOptional({ description: "Maximum biomass capacity in kilograms" })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  maxBiomassKg?: number;
}
