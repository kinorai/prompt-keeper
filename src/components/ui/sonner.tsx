"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      style={
        {
          // Ensure opaque backgrounds for all toast variants
          "--normal-bg": "hsl(var(--popover))",
          "--normal-text": "hsl(var(--popover-foreground))",
          "--normal-border": "hsl(var(--border))",
          "--success-bg": "hsl(var(--popover))",
          "--success-text": "hsl(var(--popover-foreground))",
          "--success-border": "hsl(var(--border))",
          "--error-bg": "hsl(var(--destructive))",
          "--error-text": "hsl(var(--destructive-foreground))",
          "--error-border": "hsl(var(--destructive))",
          "--warning-bg": "hsl(var(--popover))",
          "--warning-text": "hsl(var(--popover-foreground))",
          "--warning-border": "hsl(var(--border))",
        } as React.CSSProperties
      }
      // Make toasts auto-dismiss quicker by default (can be overridden via props)
      duration={typeof props.duration === "number" ? props.duration : 1600}
      {...props}
    />
  )
}

export { Toaster }
