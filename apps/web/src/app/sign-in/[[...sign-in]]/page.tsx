import { SignIn } from "@clerk/nextjs";
import { Logo } from "@/components/shared/logo";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/30 p-4">
      <Logo size={36} />
      <SignIn
        appearance={{
          variables: { colorPrimary: "#00b4d8", borderRadius: "0.625rem" },
        }}
      />
    </div>
  );
}
