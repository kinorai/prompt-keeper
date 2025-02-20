import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SearchBarProps {
  query: string;
  searchMode: string;
  onQueryChange: (value: string) => void;
  onSearchModeChange: (value: string) => void;
  onSearch: () => void;
}

export function SearchBar({
  query,
  searchMode,
  onQueryChange,
  onSearchModeChange,
  onSearch,
}: SearchBarProps) {
  return (
    <div className="flex w-full gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search conversations..."
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          className="pl-9"
          onKeyDown={(e) => {
            if (e.key === "Enter") onSearch();
          }}
        />
      </div>
      <Select value={searchMode} onValueChange={onSearchModeChange}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Search mode" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="keyword">Keyword</SelectItem>
          <SelectItem value="fuzzy">Fuzzy</SelectItem>
          <SelectItem value="regex">Regex</SelectItem>
        </SelectContent>
      </Select>
      <Button onClick={onSearch}>Search</Button>
    </div>
  );
}
