import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsNumber, IsOptional, IsPositive } from "class-validator";

/** Sets or clears a batch's assumed FCR, used to project biomass forward from feed between
 *  weight samples (see BatchProjectionService.recompute). Null turns the projection off. */
export class UpdateTargetFcrDto {
  @ApiPropertyOptional({ nullable: true, example: 1.2 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  targetFcr?: number | null;
}
