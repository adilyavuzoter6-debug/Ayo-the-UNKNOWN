import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/** A member's verdict on one answer, sent with the question and answer it is about. */
export class AssistantFeedbackDto {
  @ApiProperty({ maxLength: 4000 })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  question!: string;

  @ApiProperty({ maxLength: 8000 })
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  answer!: string;

  @ApiProperty({ description: "true for 👍, false for 👎" })
  @IsBoolean()
  helpful!: boolean;

  @ApiPropertyOptional({ maxLength: 1000, description: "What was wrong, in the member's words" })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
