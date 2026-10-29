import { AuthCard } from "@/components/auth/auth-card";
import { Logo } from "@/components/shared/logo";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/30 p-4">
      <Logo size={36} />
      <AuthCard mode="sign-in" />
    </div>
  );
}
