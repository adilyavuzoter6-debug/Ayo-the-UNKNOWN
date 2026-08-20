import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class CreateWarehouseDto {
  @ApiProperty({ example: "Ana Depo" })
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;
}
