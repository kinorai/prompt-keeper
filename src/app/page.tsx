"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { SearchBar } from "@/components/search/search-bar";
import { SearchFilters } from "@/components/search/search-filters";
import { ConversationCard } from "@/components/search/conversation-card";
import { Button } from "@/components/ui/button";
import { ArrowUp, Search, MessageSquare, Settings } from "lucide-react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useDebounce } from "../hooks/use-debounce";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LogoutButton } from "@/components/logout-button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

// Define the types for our search results
interface SearchHit {
  _id: string;
  _score: number;
  _source: {
    timestamp: string;
    model: string;
    usage?: {
      total_tokens?: number;
      prompt_tokens?: number;
      completion_tokens?: number;
    };
    messages?: Array<{
      role: string;
      content: string;
      finish_reason?: string;
    }>;
    raw_response: Record<string, unknown>;
  };
  highlight?: {
    model?: string[];
    "messages.content"?: string[];
  };
}
interface MappedSearchResult {
  id: string;
  created: string;
  model: string;
  usage?: {
    total_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  messages: Array<{
    role: string;
    content: string;
    finish_reason?: string;
  }>;
  raw_response: Record<string, unknown>;
  highlight?: {
    model?: string[];
    "messages.content"?: string[];
  };
  score?: number;
}

// Create a separate component that uses useSearchParams
function HomeContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const resultsContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

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

  const [searchResults, setSearchResults] = useState<
    MappedSearchResult[] | null
  >(null);
  const [searchMetadata, setSearchMetadata] = useState<{
    total: number;
    took: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  // Handle scroll events
  useEffect(() => {
    const handleScroll = () => {
      if (resultsContainerRef.current) {
        const scrollTop = resultsContainerRef.current.scrollTop;
        setShowScrollToTop(scrollTop > 300);
        setIsScrolled(scrollTop > 50);
      }
    };

    const resultsContainer = resultsContainerRef.current;
    if (resultsContainer) {
      resultsContainer.addEventListener("scroll", handleScroll);
      return () => {
        resultsContainer.removeEventListener("scroll", handleScroll);
      };
    }
  }, []);

  const scrollToTop = () => {
    if (resultsContainerRef.current) {
      resultsContainerRef.current.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }
  };

  const updateSearchParams = useCallback(() => {
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
  }, [
    query,
    searchMode,
    timeRange,
    resultsSize,
    fuzzyConfig,
    searchParams,
    router,
    pathname,
  ]);

  const handleSearch = useCallback(async () => {
    if (query.length < 3 && query.length > 0) return;
    updateSearchParams();

    setLoading(true);
    try {
      console.log("Sending search request with:", {
        query,
        searchMode,
        timeRange,
        size: resultsSize,
        fuzzyConfig: searchMode === "fuzzy" ? fuzzyConfig : undefined,
      });

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

      // Debug: Log the search results structure
      console.log("Search API response:", JSON.stringify(data, null, 2));

      // Check if we have valid search results
      if (!data?.hits?.hits) {
        console.error("Invalid search results structure:", data);
        setSearchResults([]);
        setSearchMetadata(null);
        return;
      }

      // Debug: Log the first result if available
      if (data.hits.hits.length > 0) {
        const firstResult = data.hits.hits[0];
        console.log("First result:", {
          id: firstResult._id,
          source: firstResult._source,
          highlight: firstResult.highlight,
        });

        // Check if the first result has messages
        if (firstResult._source?.messages) {
          console.log("First result messages:", firstResult._source.messages);
        }
      }

      // Map search results to ConversationCard props
      const mappedResults =
        data.hits.hits.map(
          (hit: SearchHit): MappedSearchResult => ({
            id: hit._id,
            created: hit._source?.timestamp || new Date().toISOString(),
            model: hit._source?.model || "Unknown",
            usage: hit._source?.usage || undefined,
            messages: hit._source?.messages || [],
            raw_response: hit._source?.raw_response || {},
            highlight: hit.highlight,
            score: hit._score,
          })
        ) || [];

      console.log("Mapped results:", mappedResults);

      // Safely handle the search results
      setSearchResults(mappedResults);

      // Safely handle the metadata
      setSearchMetadata({
        total: data?.hits?.total?.value || 0,
        took: data?.took || 0,
      });
    } catch (error) {
      console.error("Search failed:", error);
      setSearchResults([]);
      setSearchMetadata(null);
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  }, [
    query,
    searchMode,
    timeRange,
    resultsSize,
    fuzzyConfig,
    updateSearchParams,
  ]);

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
    handleSearch,
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

  useEffect(() => {
    if (searchResults && searchResults.length > 0) {
      console.log("Rendering search results:", searchResults);
    }
  }, [searchResults]);

  return (
    <div className="flex flex-col h-screen">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          <h1 className="text-lg font-semibold">Prompt Keeper</h1>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LogoutButton />
        </div>
      </div>

      {/* Main content area with results */}
      <div
        ref={resultsContainerRef}
        className="flex-1 overflow-y-auto pb-16 sm:pb-0 main-content"
      >
        <div className="container py-4 sm:py-6">
          {/* Desktop search bar and filters */}
          <div className="hidden sm:block sticky top-0 z-10 bg-background/80 backdrop-blur-sm pb-4">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <div className="w-8"></div>
                <ThemeToggle />
              </div>
              <SearchBar
                query={query}
                searchMode={searchMode}
                onQueryChange={setQuery}
                onSearchModeChange={setSearchMode}
                onSearch={handleSearch}
              />
              <SearchFilters
                timeRange={timeRange}
                resultsSize={resultsSize}
                fuzzyConfig={fuzzyConfig}
                searchMode={searchMode}
                onTimeRangeChange={setTimeRange}
                onResultsSizeChange={setResultsSize}
                onFuzzyConfigChange={setFuzzyConfig}
              />
            </div>
          </div>

          {/* Search results */}
          <div className="mt-2 sm:mt-4">
            {/* Search metadata - only visible on desktop */}
            {searchMetadata && (
              <div className="hidden sm:block text-sm text-muted-foreground mb-3 sm:mb-4">
                {searchMetadata.total > 0 ? (
                  <p>
                    Found {searchMetadata.total} results in{" "}
                    {searchMetadata.took < 1000
                      ? `${searchMetadata.took}ms`
                      : `${(searchMetadata.took / 1000).toFixed(2)}s`}
                  </p>
                ) : (
                  <p>No results found</p>
                )}
              </div>
            )}

            {/* Loading state */}
            {loading && (
              <div className="space-y-3 sm:space-y-6">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="w-full h-[200px] rounded-xl" />
                ))}
              </div>
            )}

            {/* Empty state */}
            {!loading && searchResults && searchResults.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 sm:py-16 text-center">
                <div className="bg-muted/30 p-4 rounded-full mb-4">
                  <MessageSquare className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg sm:text-xl font-semibold mb-2">
                  No conversations found
                </h3>
                <p className="text-muted-foreground max-w-md">
                  {query
                    ? "Try adjusting your search or filters to find what you're looking for."
                    : "Start searching to find conversations."}
                </p>
              </div>
            )}

            {/* Results */}
            {!loading && searchResults && searchResults.length > 0 && (
              <div className="space-y-3 sm:space-y-6">
                {searchResults.map((result) => (
                  <ConversationCard key={result.id} {...result} />
                ))}
              </div>
            )}

            {/* Initial empty state */}
            {initialLoad && !loading && !searchResults && (
              <div className="flex flex-col items-center justify-center py-12 sm:py-16 text-center">
                <div className="bg-muted/30 p-4 rounded-full mb-4">
                  <Search className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg sm:text-xl font-semibold mb-2">
                  Search your conversations
                </h3>
                <p className="text-muted-foreground max-w-md">
                  Enter a search term to find conversations from your history.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile search bar at bottom */}
      <div
        className={`sm:hidden fixed bottom-0 left-0 right-0 bg-background border-t border-border z-20 transition-all duration-300 ${
          isScrolled ? "mobile-search-compact" : "mobile-search-expanded"
        }`}
      >
        <div className="container py-2">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <SearchBar
                query={query}
                searchMode={searchMode}
                onQueryChange={setQuery}
                onSearchModeChange={setSearchMode}
                onSearch={handleSearch}
                isCompact={true}
              />
            </div>
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 rounded-full"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-[80vh] overflow-y-auto">
                <SheetHeader className="mb-4">
                  <SheetTitle>Search Settings</SheetTitle>
                  <SheetDescription>
                    Adjust your search filters and preferences
                  </SheetDescription>
                </SheetHeader>
                <div className="flex justify-between items-center mb-4">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium">Search Mode</span>
                    <Select value={searchMode} onValueChange={setSearchMode}>
                      <SelectTrigger className="w-[160px] h-9 rounded-lg border-muted-foreground/20 bg-background shadow-sm">
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
                  <ThemeToggle />
                </div>
                <div className="pb-16">
                  <SearchFilters
                    timeRange={timeRange}
                    resultsSize={resultsSize}
                    fuzzyConfig={fuzzyConfig}
                    searchMode={searchMode}
                    onTimeRangeChange={setTimeRange}
                    onResultsSizeChange={setResultsSize}
                    onFuzzyConfigChange={setFuzzyConfig}
                    alwaysExpanded={true}
                  />
                </div>
              </SheetContent>
            </Sheet>
          </div>
          {searchMetadata && (
            <div className="text-xs text-muted-foreground mt-1 px-1">
              {searchMetadata.total > 0 ? (
                <p>
                  Found {searchMetadata.total} results in{" "}
                  {searchMetadata.took < 1000
                    ? `${searchMetadata.took}ms`
                    : `${(searchMetadata.took / 1000).toFixed(2)}s`}
                </p>
              ) : (
                <p>No results found</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Scroll to top button */}
      {showScrollToTop && (
        <Button
          variant="secondary"
          size="icon"
          className="fixed bottom-20 right-4 sm:bottom-4 sm:right-4 z-30 rounded-full shadow-md scroll-to-top-button"
          onClick={scrollToTop}
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

// Main component that wraps the content with Suspense
export default function Home() {
  return (
    <Suspense fallback={<div className="p-4">Loading...</div>}>
      <HomeContent />
    </Suspense>
  );
}
