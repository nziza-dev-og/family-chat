import { LoginForm } from "@/components/auth/LoginForm";
import { CardTitle, CardDescription, CardHeader } from "@/components/ui/card";

export default function LoginPage() {
  return (
    <>
      <CardHeader className="text-center p-0 mb-6">
        <CardTitle className="text-2xl font-bold tracking-tight">Welcome Back!</CardTitle>
        <CardDescription>Sign in to continue to FamilyChat.</CardDescription>
      </CardHeader>
      <LoginForm />
    </>
  );
}
