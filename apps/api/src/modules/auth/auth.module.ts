import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { ClerkAuthGuard } from "./guards/clerk-auth.guard";
import { ClerkTokenVerifierService } from "./clerk-token-verifier.service";
import { TOKEN_VERIFIER } from "./token-verifier";

@Module({
  imports: [UsersModule],
  providers: [
    ClerkAuthGuard,
    { provide: TOKEN_VERIFIER, useClass: ClerkTokenVerifierService },
  ],
  exports: [ClerkAuthGuard],
})
export class AuthModule {}
