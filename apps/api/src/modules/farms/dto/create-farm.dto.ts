import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsLatitude, IsLongitude, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

/** Mirrors packages/validation/src/farm.ts `createFarmSchema` (shape only). */
export class CreateFarmDto {
  @ApiProperty({ minLength: 2, maxLength: 200 })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: "FARM-A1" })
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  @Matches(/^[A-Z0-9_-]+$/i, { message: "code must be alphanumeric (dashes/underscores allowed)" })
  code!: string;

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
}
