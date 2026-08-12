import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, Length, MaxLength, MinLength } from "class-validator";

/**
 * Mirrors packages/validation/src/company.ts `createCompanySchema` (shape only — see
 * docs/architecture/02-monorepo-structure.md §2.3 for why the two aren't literally shared).
 */
export class CreateCompanyDto {
  @ApiProperty({ minLength: 2, maxLength: 200 })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ minLength: 2, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  legalName?: string;

  @ApiProperty({ description: "ISO 3166-1 alpha-2 country code", example: "TR" })
  @IsString()
  @Length(2, 2)
  countryCode!: string;

  @ApiProperty({ description: "IANA timezone", example: "Europe/Istanbul" })
  @IsString()
  @MinLength(1)
  timezone!: string;
}
