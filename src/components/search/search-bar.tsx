import { Search, X } from "lucide-react";
import * as motion from "motion/react-client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface SearchBarProps {
  query: string;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  isCompact?: boolean;
}

export function SearchBar({ query, onQueryChange, onSearch, isCompact = false }: SearchBarProps) {
  const handleClearSearch = () => {
    onQueryChange("");
  };

  return (
    <div
      className={`flex w-full ${
        isCompact ? "flex-row items-center gap-2" : "flex-col gap-3 sm:flex-row sm:items-center"
      }`}
    >
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search conversations..."
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          className={`pl-9 pr-9 ${
            isCompact ? "h-9" : "h-10 sm:h-11"
          } rounded-md border-muted-foreground/20 bg-background shadow-sm focus-visible:ring-primary/50`}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSearch();
          }}
        />
        {query && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1.5 top-1/2 h-7 w-7 -translate-y-1/2 rounded-md p-0 hover:bg-muted"
            onClick={handleClearSearch}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Clear search</span>
          </Button>
        )}
      </div>
      <div className={`flex gap-2 ${isCompact ? "w-auto" : "sm:w-auto"}`}>
        <Button
          onClick={onSearch}
          className={`${
            isCompact ? "h-9 w-9 px-0" : "h-10 sm:h-11 px-4 sm:px-5"
          } rounded-md shadow-sm flex items-center justify-center transition-none`}
          asChild
        >
          <motion.button whileTap={{ scale: 0.85 }}>
            <span className="flex items-center justify-center">
              <Search className="h-4 w-4" />
              {!isCompact && <span className="ml-1">Search</span>}
            </span>
          </motion.button>
        </Button>
      </div>
    </div>
  );
}
