"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => {
      window.removeEventListener("resize", checkMobile);
    };
  }, []);

  // Get the effective theme (light or dark)
  const effectiveTheme = resolvedTheme || "light";

  // Toggle between light and dark
  const toggleTheme = () => {
    setTheme(effectiveTheme === "dark" ? "light" : "dark");
  };

  return (
    <Button
      onClick={toggleTheme}
      variant={isMobile ? "secondary" : "ghost"}
      size="icon"
      className={`rounded-full ${isMobile ? "theme-toggle-mobile" : "h-9 w-9"}`}
      aria-label="Toggle theme"
    >
      <Sun
        className={`${
          isMobile ? "h-5 w-5" : "h-[1.2rem] w-[1.2rem]"
        } rotate-0 scale-0 transition-all dark:-rotate-90 dark:scale-100`}
      />
      <Moon
        className={`absolute ${
          isMobile ? "h-5 w-5" : "h-[1.2rem] w-[1.2rem]"
        } rotate-0 scale-100 transition-all dark:rotate-0 dark:scale-0`}
      />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
