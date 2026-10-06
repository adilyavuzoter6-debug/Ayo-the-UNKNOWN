import { IsDateString, IsIn, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from "class-validator";

export class CreateColdStorageEntryDto {
  /** IN: dead fish put in the cold room. OUT: shipped to the fishmeal plant. */
  @IsIn(["IN", "OUT"])
  kind!: "IN" | "OUT";

  /** IN only: PIT (buried in the pit) or RENDERING (held for the fishmeal machine). Defaults to RENDERING. */
  @IsOptional()
  @IsIn(["PIT", "RENDERING"])
  disposal?: "PIT" | "RENDERING";

  @IsNumber()
  @IsPositive()
  weightKg!: number;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  /** The fishmeal plant a shipment goes to. Required for OUT. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  destination?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class UpdateColdStorageEntryDto {
  @IsOptional()
  @IsIn(["PIT", "RENDERING"])
  disposal?: "PIT" | "RENDERING";

  @IsOptional()
  @IsNumber()
  @IsPositive()
  weightKg?: number;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  destination?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
