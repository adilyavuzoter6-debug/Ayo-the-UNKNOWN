import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsInt, IsNumber, IsOptional, IsPositive } from "class-validator";

/**
 * Replaces how a batch was stocked and what it cost. Omit the source and price to clear the cost.
 * Same rules as creating the batch.
 */
export class UpdateStockingDto {
  @ApiPropertyOptional({ enum: ["FINGERLINGS_PURCHASED", "EGGS_PURCHASED", "EGGS_IN_HOUSE"] })
  @IsOptional()
  @IsIn(["FINGERLINGS_PURCHASED", "EGGS_PURCHASED", "EGGS_IN_HOUSE"])
  stockingSource?: "FINGERLINGS_PURCHASED" | "EGGS_PURCHASED" | "EGGS_IN_HOUSE";

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @IsPositive()
  eggCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @IsPositive()
  stockingUnitPrice?: number;

  @ApiPropertyOptional({ enum: ["TRY", "USD", "EUR"] })
  @IsOptional()
  @IsIn(["TRY", "USD", "EUR"])
  stockingCurrency?: "TRY" | "USD" | "EUR";

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @IsPositive()
  stockingExchangeRate?: number;
}
