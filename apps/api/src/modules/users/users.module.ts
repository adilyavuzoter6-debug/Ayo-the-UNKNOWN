import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { UsersService } from "./users.service";
import { MembersService } from "./members.service";
import { UsersController } from "./users.controller";

@Module({
  imports: [AuditModule],
  providers: [UsersService, MembersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
