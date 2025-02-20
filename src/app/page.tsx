"use client";

import { useEffect, useState } from "react";
import { SearchBar } from "@/components/search/search-bar";
import { SearchFilters } from "@/components/search/search-filters";
import { ConversationCard } from "@/components/search/conversation-card";
import { Button } from "@/components/ui/button";
import { ArrowUp } from "lucide-react";

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
    raw_response: any;
  };
  _score?: number;
  highlight?: {
    "messages.content": string[];
  };
}

interface SearchMetadata {
  total: { value: number };
  searchTime: number;
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState("fuzzy");
  const [timeRange, setTimeRange] = useState("1y");
  const [resultsSize, setResultsSize] = useState(20);
  const [fuzzyConfig, setFuzzyConfig] = useState({
    fuzziness: "AUTO",
    prefixLength: 2,
  });
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchMetadata, setSearchMetadata] = useState<{
    total: number;
    searchTime: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (query.length < 3 && query.length > 0) return;

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
    }
  };

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
    <div className="min-h-screen p-4 sm:p-8 max-w-7xl mx-auto">
      <div className="sticky top-4 z-10 space-y-4 bg-background/80 backdrop-blur-sm p-4 rounded-lg shadow-sm">
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
        {searchMetadata && (
          <div className="text-sm text-muted-foreground">
            Found {searchMetadata.total} results in {searchMetadata.searchTime}
            ms
          </div>
        )}
      </div>

      <div className="mt-8 space-y-6">
        {loading ? (
          <div className="text-center">Loading...</div>
        ) : searchResults && searchResults.length > 0 ? (
          searchResults.map((result, index) => (
            <ConversationCard key={index} conversation={result} />
          ))
        ) : (
          <div className="text-center text-muted-foreground">
            {query ? "No results found" : "Enter a search query to begin"}
          </div>
        )}
      </div>

      <Button
        className="fixed bottom-8 right-8 rounded-full shadow-lg"
        size="icon"
        onClick={scrollToTop}
      >
        <ArrowUp className="h-4 w-4" />
      </Button>
    </div>
  );
}
