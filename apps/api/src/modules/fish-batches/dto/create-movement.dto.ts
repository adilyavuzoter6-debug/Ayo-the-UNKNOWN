import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsInt, IsOptional, IsPositive, IsString, MaxLength } from "class-validator";

/** Records a TRANSFER — the same batch identity, reallocated to a different tank. */
export class CreateMovementDto {
  @ApiProperty()
  @IsString()
  fromTankId!: string;

  @ApiProperty()
  @IsString()
  toTankId!: string;

  @ApiProperty({ example: 2000 })
  @IsInt()
  @IsPositive()
  fishCount!: number;

  @ApiPropertyOptional({ description: "ISO date/time the transfer actually happened" })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
