"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, setStoredAccessToken } from "@/lib/api";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(event.currentTarget);

    try {
      const response = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: formData.get("email"),
          password: formData.get("password"),
        }),
      });

      if (response.ok) {
        const payload = (await response.json()) as { accessToken?: string };

        if (payload.accessToken) {
          setStoredAccessToken(payload.accessToken);
        }

        router.push("/dashboard");
        router.refresh();
        return;
      }

      setError(
        "Credenciales incorrectas. Verifica tu correo y contrasena.",
      );
    } catch {
      setError("Credenciales incorrectas. Verifica tu correo y contrasena.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Correo electronico</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="socio@ejemplo.com"
          autoComplete="email"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Contrasena</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Iniciando sesion..." : "Iniciar sesion"}
      </Button>
    </form>
  );
}
