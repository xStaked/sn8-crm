import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-[360px] border-border bg-card">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-[28px] font-semibold leading-[1.2]">
            CRM
          </CardTitle>
          <CardDescription>Accede a tu panel de gestion</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </div>
  );
}
