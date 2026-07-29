"use client";

import { useState, useEffect } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Fingerprint } from "lucide-react";

// better-auth rejects with a plain { message, code, status } object rather than an Error,
// so an `instanceof Error` check alone throws away the actual reason for the failure.
const errorMessage = (err: unknown, fallback: string) => {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null) {
    const { message, code } = err as { message?: unknown; code?: unknown };
    if (typeof message === "string" && message) return typeof code === "string" ? `${message} (${code})` : message;
    if (typeof code === "string" && code) return code;
  }
  return fallback;
};

export default function SignIn({ defaultSignUp = false }: { defaultSignUp?: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(defaultSignUp);
  const [isPasskeyAutofillReady, setIsPasskeyAutofillReady] = useState(false);

  // Password managers key their heuristics off id/name, so the sign-in and sign-up password
  // inputs use the documented, distinct ids rather than sharing one
  const passwordId = isSignUp ? "new-password" : "current-password";

  // Check if any user exists to toggle between Sign In and Sign Up (Admin creation)
  // For now, we'll handle the error from the server if signup is disabled.
  // But for better UX, we could check a public endpoint.
  // We'll assume the user knows if they are setting up the admin.

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (isSignUp) {
        const { error } = await authClient.signUp.email({
          email,
          password,
          name,
        });
        if (error) throw error;
        toast.success("Account created successfully!");
        // Prompt for passkey registration after signup
        await registerPasskey();
        window.location.href = "/";
      } else {
        const { error } = await authClient.signIn.email({
          email,
          password,
        });
        if (error) throw error;
        toast.success("Signed in successfully!");
        window.location.href = "/";
      }
    } catch (err: unknown) {
      const message = errorMessage(err, "Authentication failed");
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasskeySignIn = async () => {
    setIsLoading(true);
    try {
      const result = await authClient.signIn.passkey();
      if (result?.error) throw result.error;
      toast.success("Signed in with Passkey!");
      window.location.href = "/";
    } catch (err: unknown) {
      const message = errorMessage(err, "Passkey sign in failed");
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const registerPasskey = async () => {
    try {
      const result = await authClient.passkey.addPasskey({
        name: "My Passkey",
      });
      if (result?.error) throw result.error;
      toast.success("Passkey registered successfully!");
    } catch (err: unknown) {
      const message = errorMessage(err, "Unknown error");
      toast.error("Failed to register passkey: " + message);
    }
  };

  // Conditional UI for Passkeys.
  // WebAuthn needs a secure context and conditional mediation, so both are feature-detected
  // before starting the request. The `webauthn` autocomplete token is only advertised once
  // the request is pending — offering it otherwise gives the browser a passkey affordance
  // that can never resolve, which confuses Safari's AutoFill on iOS.
  useEffect(() => {
    if (!window.isSecureContext) return;
    if (typeof PublicKeyCredential === "undefined") return;
    if (typeof PublicKeyCredential.isConditionalMediationAvailable !== "function") return;

    let cancelled = false;

    PublicKeyCredential.isConditionalMediationAvailable()
      .then((isAvailable) => {
        if (!isAvailable || cancelled) return;
        setIsPasskeyAutofillReady(true);

        return authClient.signIn.passkey({ autoFill: true }).then((result) => {
          if (cancelled || result?.error) return;
          toast.success("Signed in with Passkey!");
          window.location.href = "/";
        });
      })
      .catch(() => {
        // Ignore errors from autofill (e.g. if cancelled or not supported)
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="pt-8">
          <CardTitle>{isSignUp ? "Create Admin Account" : "Sign In"}</CardTitle>
          <CardDescription>
            {isSignUp
              ? "Set up the initial admin account for Prompt Keeper."
              : "Enter your credentials to access your prompts."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* method="post" so that if the page ever fails to hydrate, the browser's native submit
              cannot serialize the credentials into the URL — and from there into logs and history */}
          <form onSubmit={handleEmailSignIn} method="post" className="space-y-4">
            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  name="name"
                  autoComplete="name"
                  placeholder="Admin User"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete={isPasskeyAutofillReady ? "username webauthn" : "username"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={passwordId}>Password</Label>
              <Input
                key={passwordId}
                id={passwordId}
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={isSignUp ? "new-password" : "current-password"}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSignUp ? "Create Account" : "Sign In"}
            </Button>
          </form>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
            </div>
          </div>

          <Button variant="outline" className="w-full" onClick={handlePasskeySignIn} disabled={isLoading}>
            <Fingerprint className="mr-2 h-4 w-4" />
            Passkey
          </Button>
        </CardContent>
        <CardFooter className="flex justify-center">
          <Button variant="link" onClick={() => setIsSignUp(!isSignUp)} className="text-sm text-muted-foreground">
            {isSignUp ? "Already have an account? Sign In" : "Need to set up admin? Create Account"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
