import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsInt, IsOptional, IsString, MaxLength } from "class-validator";

/**
 * A direct correction to a batch's count in one tank — not a death, not a transfer. Signed:
 * positive gives fish back, negative takes them away. For fixing a count that was wrong for some
 * other reason (a stocking typo, a recount against a paper tally) without it reading as mortality.
 */
export class CreateBatchAdjustmentDto {
  @ApiProperty()
  @IsString()
  tankId!: string;

  @ApiProperty({ example: -12, description: "Signed fish count" })
  @IsInt()
  fishCount!: number;

  @ApiPropertyOptional({ description: "ISO date/time the correction applies to (defaults to now)" })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
