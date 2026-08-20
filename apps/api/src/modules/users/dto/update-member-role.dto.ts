import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";
import { ROLES, type Role } from "@aquai/types";

const ASSIGNABLE_ROLES = ROLES.filter((r) => r !== "PLATFORM_ADMIN");

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: ASSIGNABLE_ROLES })
  @IsIn(ASSIGNABLE_ROLES)
  role!: Role;
}
