import { ApiProperty } from "@nestjs/swagger";
import { IsDateString } from "class-validator";

export class FcrQueryDto {
  @ApiProperty({ description: "Period start (inclusive), ISO date" })
  @IsDateString()
  periodStart!: string;

  @ApiProperty({ description: "Period end (inclusive), ISO date" })
  @IsDateString()
  periodEnd!: string;
}
