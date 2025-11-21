import { Metadata } from "next";
import SignIn from "@/components/auth/sign-in";

export const metadata: Metadata = {
  title: "Login - Prompt Keeper",
  description: "Login to access Prompt Keeper",
};

export default function LoginPage() {
  return <SignIn />;
}
