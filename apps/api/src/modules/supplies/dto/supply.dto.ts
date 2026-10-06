import { IsDateString, IsNumber, IsOptional, IsPositive, IsString, MaxLength, MinLength } from "class-validator";

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
  @IsString()
  farmId!: string;

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
}

export class TransferSupplyDto {
  @IsString()
  fromFarmId!: string;

  @IsString()
  toFarmId!: string;

  @IsNumber()
  @IsPositive()
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
