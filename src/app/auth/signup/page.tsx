import { SignupForm } from "@/components/auth/SignupForm";
import { CardTitle, CardDescription, CardHeader } from "@/components/ui/card";

export default function SignupPage() {
  return (
    <>
      <CardHeader className="text-center p-0 mb-6">
        <CardTitle className="text-2xl font-bold tracking-tight">Create your Account</CardTitle>
        <CardDescription>Join FamilyChat to connect with your loved ones.</CardDescription>
      </CardHeader>
      <SignupForm />
    </>
  );
}
