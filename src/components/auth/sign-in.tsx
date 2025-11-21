"use client";

import { useState, useEffect } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Fingerprint } from "lucide-react";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

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
      const message = err instanceof Error ? err.message : "Authentication failed";
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
      const message = err instanceof Error ? err.message : "Passkey sign in failed";
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
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error("Failed to register passkey: " + message);
    }
  };

  // Conditional UI for Passkeys
  useEffect(() => {
    // Attempt to autofill passkey if available
    // This might trigger the browser's passkey prompt if the user clicks the input
    authClient.signIn
      .passkey({
        autoFill: true,
      })
      .then((result) => {
        if (!result?.error) {
          toast.success("Signed in with Passkey!");
          window.location.href = "/";
        }
      })
      .catch(() => {
        // Ignore errors from autofill (e.g. if cancelled or not supported)
      });
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
          <form onSubmit={handleEmailSignIn} className="space-y-4">
            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
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
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username webauthn"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={isSignUp ? "new-password" : "current-password webauthn"}
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
