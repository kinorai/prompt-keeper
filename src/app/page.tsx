"use client";

import { useEffect, useState } from "react";
import { SearchBar } from "@/components/search/search-bar";
import { SearchFilters } from "@/components/search/search-filters";
import { ConversationCard } from "@/components/search/conversation-card";
import { Button } from "@/components/ui/button";
import { ArrowUp, Loader2, Search, MessageSquare, X } from "lucide-react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useDebounce } from "../hooks/use-debounce";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface SearchResult {
  _source: {
    timestamp: string;
    model: string;
    messages: Array<{
      role: string;
      content: string;
    }>;
    usage: {
      total_tokens: number;
      prompt_tokens: number;
      completion_tokens: number;
    };
    latency: number;
    raw_response: JSON;
  };
  _score?: number;
  highlight?: {
    "messages.content": string[];
  };
}

export default function Home() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [searchMode, setSearchMode] = useState(
    searchParams.get("mode") || "fuzzy"
  );
  const [timeRange, setTimeRange] = useState(searchParams.get("time") || "1y");
  const [resultsSize, setResultsSize] = useState(
    parseInt(searchParams.get("size") || "20")
  );
  const [fuzzyConfig, setFuzzyConfig] = useState({
    fuzziness: searchParams.get("fuzziness") || "AUTO",
    prefixLength: parseInt(searchParams.get("prefix") || "2"),
  });

  const debouncedQuery = useDebounce(query, 300);

  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchMetadata, setSearchMetadata] = useState<{
    total: number;
    searchTime: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  const updateSearchParams = () => {
    const params = new URLSearchParams(searchParams);
    if (query) params.set("q", query);
    else params.delete("q");

    params.set("mode", searchMode);
    params.set("time", timeRange);
    params.set("size", resultsSize.toString());

    if (searchMode === "fuzzy") {
      params.set("fuzziness", fuzzyConfig.fuzziness);
      params.set("prefix", fuzzyConfig.prefixLength.toString());
    } else {
      params.delete("fuzziness");
      params.delete("prefix");
    }

    router.replace(`${pathname}?${params.toString()}`);
  };

  const handleSearch = async () => {
    if (query.length < 3 && query.length > 0) return;
    updateSearchParams();

    setLoading(true);
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          searchMode,
          timeRange,
          size: resultsSize,
          fuzzyConfig: searchMode === "fuzzy" ? fuzzyConfig : undefined,
        }),
      });

      const data = await response.json();

      // Safely handle the search results
      setSearchResults(data.hits || []);

      // Safely handle the metadata
      setSearchMetadata({
        total: data.total?.value || 0,
        searchTime: data.searchTime || 0,
      });
    } catch (error) {
      console.error("Search failed:", error);
      setSearchResults([]);
      setSearchMetadata(null);
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  };

  useEffect(() => {
    if (debouncedQuery.length >= 3 || debouncedQuery.length === 0) {
      handleSearch();
    }
  }, [
    debouncedQuery,
    searchMode,
    timeRange,
    resultsSize,
    fuzzyConfig.fuzziness,
    fuzzyConfig.prefixLength,
  ]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key.length === 1 && e.key.match(/[a-zA-Z0-9]/)) {
        setQuery(e.key);
        const searchInput = document.querySelector(
          'input[type="text"]'
        ) as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
        }
      }
    };

    window.addEventListener("keypress", handleKeyPress);
    return () => window.removeEventListener("keypress", handleKeyPress);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="container px-4 sm:px-6 py-6 space-y-4 sm:space-y-8 mx-auto">
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm p-3 sm:p-5 rounded-xl shadow-sm border sm:rounded-xl sm:mx-0 sticky-search-container">
        <div className="flex items-center space-x-2 mb-3 sm:hidden">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 pr-9 h-10 rounded-full border-muted-foreground/20 bg-background shadow-sm focus-visible:ring-primary/50"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
            />
            {query && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1.5 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full p-0 hover:bg-muted"
                onClick={() => setQuery("")}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Clear search</span>
              </Button>
            )}
          </div>
          <div>
            <ThemeToggle />
          </div>
        </div>

        <div className="flex justify-end mb-4 sm:hidden">
          <div className="flex gap-2 w-full">
            <div className="flex-1">
              <Select value={searchMode} onValueChange={setSearchMode}>
                <SelectTrigger className="h-10 rounded-full border-muted-foreground/20 bg-background shadow-sm w-full">
                  <SelectValue placeholder="Search mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keyword">
                    <div className="flex items-center">
                      <span>Keyword</span>
                      <Badge variant="outline" className="ml-2 text-xs">
                        Exact
                      </Badge>
                    </div>
                  </SelectItem>
                  <SelectItem value="fuzzy">
                    <div className="flex items-center">
                      <span>Fuzzy</span>
                      <Badge variant="outline" className="ml-2 text-xs">
                        Similar
                      </Badge>
                    </div>
                  </SelectItem>
                  <SelectItem value="regex">
                    <div className="flex items-center">
                      <span>Regex</span>
                      <Badge variant="outline" className="ml-2 text-xs">
                        Pattern
                      </Badge>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleSearch}
              className="h-10 px-4 rounded-full shadow-sm"
            >
              Search
            </Button>
          </div>
        </div>

        {/* Desktop search bar */}
        <div className="hidden sm:flex items-center mb-4">
          <div className="flex-1">
            <SearchBar
              query={query}
              searchMode={searchMode}
              onQueryChange={setQuery}
              onSearchModeChange={setSearchMode}
              onSearch={handleSearch}
            />
          </div>
          <div className="ml-3">
            <ThemeToggle />
          </div>
        </div>

        <SearchFilters
          timeRange={timeRange}
          resultsSize={resultsSize}
          fuzzyConfig={fuzzyConfig}
          searchMode={searchMode}
          onTimeRangeChange={setTimeRange}
          onResultsSizeChange={setResultsSize}
          onFuzzyConfigChange={setFuzzyConfig}
        />
        {searchMetadata && (
          <div className="text-sm text-muted-foreground flex items-center mt-3">
            <span className="font-medium">
              {searchMetadata.total.toLocaleString()}
            </span>
            <span className="mx-1">results in</span>
            <span className="font-medium">
              {searchMetadata.searchTime.toLocaleString()}ms
            </span>
          </div>
        )}
      </div>

      <div className="space-y-4 sm:space-y-6 main-content">
        {loading ? (
          <div className="space-y-4 sm:space-y-6">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="rounded-xl border bg-card shadow-sm p-3 sm:p-4 space-y-4 overflow-hidden"
              >
                <div className="flex flex-wrap items-center gap-2 border-b pb-4">
                  <Skeleton className="h-6 w-24 rounded-full" />
                  <Skeleton className="h-6 w-32 rounded-full" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
                <Skeleton className="h-24 w-full rounded-lg" />
                <Skeleton className="h-24 w-full rounded-lg" />
              </div>
            ))}
          </div>
        ) : initialLoad ? (
          <div className="text-center py-12 sm:py-16 px-4 rounded-xl border bg-muted/5">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <MessageSquare className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl sm:text-2xl font-semibold mb-2">
              Welcome to Prompt Keeper
            </h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto text-sm sm:text-base">
              Search through your LLM conversation history to find and analyze
              past interactions
            </p>
            <div className="flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          </div>
        ) : searchResults && searchResults.length > 0 ? (
          searchResults.map((result, index) => (
            <ConversationCard key={index} conversation={result} />
          ))
        ) : (
          <div className="text-center py-12 sm:py-16 px-4 rounded-xl border bg-muted/5">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted/20 mb-4">
              <Search className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg sm:text-xl font-medium mb-2">
              {query ? "No results found" : "Enter a search query to begin"}
            </h3>
            <p className="text-muted-foreground max-w-md mx-auto text-sm sm:text-base">
              {query
                ? "Try adjusting your search terms or filters to find what you're looking for."
                : "Type at least 3 characters to search through your conversation history."}
            </p>
          </div>
        )}
      </div>

      <Button
        className="fixed bottom-4 sm:bottom-8 right-4 sm:right-8 rounded-full shadow-lg h-10 w-10 sm:h-12 sm:w-12"
        size="icon"
        onClick={scrollToTop}
      >
        <ArrowUp className="h-4 w-4 sm:h-5 sm:w-5" />
      </Button>
    </div>
  );
}
