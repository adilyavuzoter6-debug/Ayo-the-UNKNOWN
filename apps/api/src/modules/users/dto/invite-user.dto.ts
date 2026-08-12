import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsIn } from "class-validator";
import { ROLES, type Role } from "@aquai/types";

const INVITABLE_ROLES = ROLES.filter((r) => r !== "PLATFORM_ADMIN");

/** Mirrors packages/validation/src/user.ts `inviteUserSchema` (shape only). */
export class InviteUserDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: INVITABLE_ROLES })
  @IsIn(INVITABLE_ROLES)
  role!: Role;
}
