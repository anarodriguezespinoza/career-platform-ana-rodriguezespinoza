"use client";

import { Amplify } from "aws-amplify";
import { fetchAuthSession, signIn } from "aws-amplify/auth";
import { FormEvent, useState } from "react";

const issuer = process.env.NEXT_PUBLIC_COGNITO_ISSUER;
const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
const userPoolId = issuer?.split("/").filter(Boolean).at(-1);

if (userPoolId && clientId) {
  Amplify.configure(
    { Auth: { Cognito: { userPoolId, userPoolClientId: clientId } } },
    { ssr: true },
  );
}

export function SignInForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    try {
      await signIn({
        username: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? ""),
      });
      const session = await fetchAuthSession();
      const token = session.tokens?.accessToken?.toString();
      if (!token) throw new Error("Missing access token");
      const response = await fetch("/api/auth/session", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Unauthorized");
      window.location.assign("/admin");
    } catch {
      setError("Sign-in failed. Check your credentials and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      {error ? <p role="alert">{error}</p> : null}
      <button type="submit" disabled={pending}>
        {pending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
