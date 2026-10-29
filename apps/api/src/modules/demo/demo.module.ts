import { Module } from "@nestjs/common";
import { ClerkDemoAccounts, DEMO_ACCOUNTS } from "./demo-accounts";
import { DemoCloneService } from "./demo-clone.service";
import { DemoController } from "./demo.controller";
import { DemoService } from "./demo.service";

@Module({
  providers: [DemoService, DemoCloneService, { provide: DEMO_ACCOUNTS, useClass: ClerkDemoAccounts }],
  controllers: [DemoController],
})
export class DemoModule {}
