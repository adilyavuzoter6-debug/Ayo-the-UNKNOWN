import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsNumber, IsOptional, IsString, MaxLength } from "class-validator";

/** Manual reconciliation after a physical stock count — quantityKg may be positive (found
 * more than expected) or negative (found less). */
export class CreateAdjustmentDto {
  @ApiProperty({ example: -12.5, description: "Signed quantity in kilograms" })
  @IsNumber()
  quantityKg!: number;

  @ApiPropertyOptional({ description: "ISO date the recount happened (defaults to now)" })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
