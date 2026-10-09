import { IsDateString, IsIn, IsNumber, IsOptional, IsPositive, IsString, MaxLength, MinLength } from "class-validator";

export class CreateSupplyItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  category!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  unit!: string;
}

export class ReceiveSupplyDto {
  /** Omit for the company's shared depot (not tied to one farm). */
  @IsOptional()
  @IsString()
  farmId?: string;

  @IsNumber()
  @IsPositive()
  quantity!: number;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  /** Unit price, in unitPriceCurrency. Omitted entirely means this receipt isn't priced. */
  @IsOptional()
  @IsNumber()
  @IsPositive()
  unitPriceAmount?: number;

  /** Defaults to TRY. */
  @IsOptional()
  @IsIn(["TRY", "USD", "EUR"])
  unitPriceCurrency?: "TRY" | "USD" | "EUR";

  /** TRY per 1 unit of unitPriceCurrency. Omit to use the Central Bank rate for occurredAt. */
  @IsOptional()
  @IsNumber()
  @IsPositive()
  exchangeRate?: number;
}

export class TransferSupplyDto {
  /** Omit for the company's shared depot. */
  @IsOptional()
  @IsString()
  fromFarmId?: string;

  /** Omit for the company's shared depot. */
  @IsOptional()
  @IsString()
  toFarmId?: string;

  @IsNumber()
  @IsPositive()
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class UpdateSupplyMovementDto {
  @IsOptional()
  @IsNumber()
  @IsPositive()
  quantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  /** Only meaningful for a RECEIVED movement — corrects its purchase price. */
  @IsOptional()
  @IsNumber()
  @IsPositive()
  unitPriceAmount?: number;

  @IsOptional()
  @IsIn(["TRY", "USD", "EUR"])
  unitPriceCurrency?: "TRY" | "USD" | "EUR";

  @IsOptional()
  @IsNumber()
  @IsPositive()
  exchangeRate?: number;
}
