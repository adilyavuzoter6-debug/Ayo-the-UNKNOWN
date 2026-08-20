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

export class SplitTargetDto {
  @ApiProperty({ description: "Tank the resulting child batch is stocked into" })
  @IsString()
  toTankId!: string;

  @ApiProperty({ example: 1500 })
  @IsInt()
  @IsPositive()
  fishCount!: number;

  @ApiProperty({ example: "LOT-2026-00125-A" })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  lotCode!: string;
}

/**
 * Splits a batch into N new child batches, each stocked into its own target tank. All
 * children are carved out of the same source tank in one operation — a batch simultaneously
 * split from multiple source tanks in a single request isn't supported yet.
 */
export class SplitBatchDto {
  @ApiProperty({ description: "Tank the split is carved out of" })
  @IsString()
  fromTankId!: string;

  @ApiProperty({ type: [SplitTargetDto] })
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => SplitTargetDto)
  splits!: SplitTargetDto[];
}
