import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { Logo } from "@/components/shared/logo";

export const metadata: Metadata = {
  title: "Hesap oluştur",
};

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/30 p-4">
      <Logo size={36} />
      <AuthCard mode="sign-up" />
    </div>
  );
}
