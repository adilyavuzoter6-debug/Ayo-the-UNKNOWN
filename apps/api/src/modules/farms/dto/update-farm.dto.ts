import { ApiPropertyOptional } from "@nestjs/swagger";
import { FarmStatus } from "@prisma/client";
import {
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class UpdateFarmDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ example: "FARM-A1" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  @Matches(/^[A-Z0-9_-]+$/i, { message: "code must be alphanumeric (dashes/underscores allowed)" })
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({ enum: FarmStatus })
  @IsOptional()
  @IsEnum(FarmStatus)
  status?: FarmStatus;

  @ApiPropertyOptional({
    nullable: true,
    description:
      "Another farm this one physically shares a stock depot with. Supplies balances/consumption " +
      "pool across every farm linked this way. Send null to unlink.",
  })
  @IsOptional()
  @IsString()
  sharesDepotWithFarmId?: string | null;
}
