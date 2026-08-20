import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from "class-validator";

/** Receives a new delivery/lot of a feed product into a warehouse — creates the
 * FeedInventoryBatch and its opening PURCHASE transaction atomically. */
export class ReceiveStockDto {
  @ApiProperty()
  @IsString()
  feedProductId!: string;

  @ApiProperty({ example: 500, description: "Quantity received, in kilograms" })
  @IsNumber()
  @IsPositive()
  quantityKg!: number;

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

  @ApiPropertyOptional({ description: "Unit cost per kilogram" })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  unitCostPerKg?: number;

  @ApiPropertyOptional({ description: "ISO date the delivery was received (defaults to now)" })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
