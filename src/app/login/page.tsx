import { Metadata } from "next";
import LoginForm from "./login-form";

export const metadata: Metadata = {
  title: "Login - Prompt Keeper",
  description: "Login to access Prompt Keeper",
};

export default function LoginPage() {
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
        <div className="flex flex-col space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Prompt Keeper</h1>
          <p className="text-sm text-muted-foreground">Enter your credentials to access your LLM conversations</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
