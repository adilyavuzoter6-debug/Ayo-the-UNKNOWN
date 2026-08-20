import { ApiPropertyOptional } from "@nestjs/swagger";
import { TankStatus, TankType } from "@prisma/client";
import { IsEnum, IsNumber, IsOptional, IsPositive, IsString, MaxLength, MinLength } from "class-validator";

export class UpdateTankDto {
  @ApiPropertyOptional({ example: "A12" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  code?: string;

  @ApiPropertyOptional({ enum: TankType })
  @IsOptional()
  @IsEnum(TankType)
  type?: TankType;

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

  @ApiPropertyOptional({ enum: TankStatus })
  @IsOptional()
  @IsEnum(TankStatus)
  status?: TankStatus;
}
