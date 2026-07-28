import { Metadata } from "next";
import SignIn from "@/components/auth/sign-in";

export const metadata: Metadata = {
  title: "Login - Prompt Keeper",
  description: "Login to access Prompt Keeper",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ signup?: string }> }) {
  const { signup } = await searchParams;

  // /login?signup=1 opens the admin creation form directly
  return <SignIn defaultSignUp={signup === "1" || signup === "true"} />;
}
