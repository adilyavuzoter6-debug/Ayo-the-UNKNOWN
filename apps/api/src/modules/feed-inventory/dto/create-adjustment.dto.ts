import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsIn, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from "class-validator";

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

/** Corrects a lot's own details. The quantity it holds is corrected with an adjustment instead. */
export class UpdateInventoryBatchDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  supplierLotCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  manufactureDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @ApiPropertyOptional({ description: "Unit cost per kilogram, in unitCostCurrency" })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  unitCostAmount?: number;

  @ApiPropertyOptional({ enum: ["TRY", "USD", "EUR"], description: "Defaults to TRY" })
  @IsOptional()
  @IsIn(["TRY", "USD", "EUR"])
  unitCostCurrency?: "TRY" | "USD" | "EUR";

  @ApiPropertyOptional({ description: "TRY per 1 unit of unitCostCurrency, at the lot's purchase date" })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  exchangeRate?: number;
}
