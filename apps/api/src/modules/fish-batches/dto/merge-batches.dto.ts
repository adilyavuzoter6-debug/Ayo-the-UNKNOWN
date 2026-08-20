import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";

export class MergeSourceDto {
  @ApiProperty()
  @IsString()
  batchId!: string;

  @ApiProperty({ description: "Tank this source batch's fish are being merged out of" })
  @IsString()
  fromTankId!: string;

  @ApiProperty({ example: 1000 })
  @IsInt()
  @IsPositive()
  fishCount!: number;
}

/** Merges N source batches into one new batch, stocked into a single target tank. */
export class MergeBatchesDto {
  @ApiProperty({ type: [MergeSourceDto] })
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => MergeSourceDto)
  sources!: MergeSourceDto[];

  @ApiProperty({ description: "Tank the merged batch ends up in" })
  @IsString()
  toTankId!: string;

  @ApiProperty({ example: "LOT-2026-00200" })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  lotCode!: string;
}
