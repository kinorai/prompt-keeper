import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type BadgeProps = React.ComponentProps<typeof Badge>;

// Model name badge with truncation and max width for list/card headers
export const ModelBadge: React.FC<BadgeProps> = ({ className, children, ...props }) => (
  <Badge
    variant="outline"
    className={cn(
      "font-medium text-xs py-0 px-1.5 max-w-[60%] sm:max-w-[50%] overflow-hidden whitespace-nowrap justify-start",
      className,
    )}
    {...props}
  >
    <span className="truncate">{children}</span>
  </Badge>
);

// Small numeric score badge for list rows
export const ScoreBadgeSmall: React.FC<BadgeProps> = ({ className, children, ...props }) => (
  <Badge variant="secondary" className={cn("text-[10px] py-0 px-1", className)} {...props}>
    {children}
  </Badge>
);

// Highlighted score badge for detail header
export const ScoreBadgeHighlight: React.FC<BadgeProps> = ({ className, children, ...props }) => (
  <Badge
    variant="outline"
    className={cn("bg-primary/10 font-medium text-xs sm:text-sm py-0 px-1.5", className)}
    {...props}
  >
    {children}
  </Badge>
);

// Inline hint badge used next to select labels (Keyword/Fuzzy/Regex)
export const ModeHintBadge: React.FC<BadgeProps> = ({ className, children, ...props }) => (
  <Badge variant="outline" className={cn("ml-2 text-xs", className)} {...props}>
    {children}
  </Badge>
);

// Secondary filter summary pill (time range, results size, fuzziness)
export const FilterBadge: React.FC<BadgeProps> = ({ className, children, ...props }) => (
  <Badge variant="secondary" className={cn("text-xs font-normal py-0 px-1.5", className)} {...props}>
    {children}
  </Badge>
);

export type { BadgeProps as ReusableBadgeProps };
