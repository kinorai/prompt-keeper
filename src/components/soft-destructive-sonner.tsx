"use client";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";

const SoftDestructiveSonnerDemo = () => {
  return (
    <Button
      variant="outline"
      onClick={() =>
        toast.error("Oops, there was an error processing your request.", {
          style: {
            "--normal-bg": "color-mix(in oklab, hsl(var(--destructive)) 10%, hsl(var(--background)))",
            "--normal-text": "hsl(var(--destructive))",
            "--normal-border": "hsl(var(--destructive))",
          } as React.CSSProperties,
        })
      }
    >
      Soft Destructive Toast
    </Button>
  );
};

export default SoftDestructiveSonnerDemo;
