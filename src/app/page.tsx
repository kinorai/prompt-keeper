"use client";

import { useEffect, useState, useRef, useCallback, Suspense, useMemo } from "react";
import { SearchBar } from "@/components/search/search-bar";
import { SearchFilters } from "@/components/search/search-filters";
import { ConversationCard } from "@/components/search/conversation-card";
import { ConversationListItem } from "@/components/search/conversation-list-item";
import { Button } from "@/components/ui/button";
import { ArrowUp, Search, MessageSquare, Settings, ChevronLeft, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import debounce from "lodash.debounce";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LogoutButton } from "@/components/logout-button";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DEFAULT_ROLES, FILTERS_DEFAULTS, MOBILE_MEDIA_QUERY, SEARCH_BEHAVIOR_DEFAULTS } from "@/lib/defaults";
import { Separator } from "@/components/ui/separator";

// Define the types for our search results
interface SearchHit {
  _id: string;
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
}

// Create a separate component that uses useSearchParams
interface CustomRange {
  start: string;
  end: string;
}

function HomeContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const resultsContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  const [query, setQuery] = useState(searchParams.get("q") || "");
  // Smart mode only
  const initialTime = (() => {
    const t = searchParams.get("time") || FILTERS_DEFAULTS.timeRange;
    if (t === "custom") {
      const start = searchParams.get("start");
      const end = searchParams.get("end");
      if (start && end) return { start, end } as CustomRange;
    }
    return t;
  })();
  const [timeRange, setTimeRange] = useState<string | CustomRange>(initialTime);
  const [resultsSize, setResultsSize] = useState(
    parseInt(searchParams.get("size") || String(FILTERS_DEFAULTS.resultsSize)),
  );
  // Removed fuzzy/phrase config in Smart mode
  const initialRoles = (() => {
    const rolesParam = searchParams.get("roles");
    if (!rolesParam) return [...DEFAULT_ROLES] as string[];
    const parts = rolesParam
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);
    const allowed = DEFAULT_ROLES as readonly string[];
    const filtered = parts.filter((p) => allowed.includes(p));
    return filtered.length > 0 ? filtered : [...DEFAULT_ROLES];
  })();
  const [roles, setRoles] = useState<string[]>(initialRoles);

  const [searchResults, setSearchResults] = useState<MappedSearchResult[] | null>(null);
  const [searchMetadata, setSearchMetadata] = useState<{
    total: number;
    took: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const selectedIdFromUrl = searchParams.get("cid");
  const [isMobile, setIsMobile] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

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

  // Track mobile breakpoint (match Tailwind sm: 640px)
  useEffect(() => {
    const mql = window.matchMedia(MOBILE_MEDIA_QUERY);
    const update = () => setIsMobile(mql.matches);
    update();
    const handleChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    type MQLWithLegacy = MediaQueryList & {
      addListener?: (listener: (e: MediaQueryListEvent) => void) => void;
      removeListener?: (listener: (e: MediaQueryListEvent) => void) => void;
    };

    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", handleChange);
      return () => mql.removeEventListener("change", handleChange);
    }

    const legacy = mql as MQLWithLegacy;
    if (typeof legacy.addListener === "function") {
      legacy.addListener(handleChange);
      return () => legacy.removeListener?.(handleChange);
    }

    return () => {};
  }, []);

  const scrollToTop = () => {
    if (resultsContainerRef.current) {
      resultsContainerRef.current.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }
  };

  const handleDeleteConversation = (deletedId: string) => {
    // Remove the deleted conversation from the search results
    if (searchResults) {
      setSearchResults(searchResults.filter((result) => result.id !== deletedId));
      // Update metadata
      if (searchMetadata) {
        setSearchMetadata({
          ...searchMetadata,
          total: Math.max(0, searchMetadata.total - 1),
        });
      }
    }
    // If the deleted conversation is currently selected, clear the selection
    if (selectedIdFromUrl === deletedId) {
      const params = new URLSearchParams(searchParams);
      params.delete("cid");
      router.replace(`${pathname}?${params.toString()}`);
    }
  };

  const handleRestoreConversation = (item: MappedSearchResult) => {
    // Re-insert the restored conversation and re-sort by created desc
    setSearchResults((prev) => {
      const next = prev ? [item, ...prev] : [item];
      return next.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
    });
    setSearchMetadata((prev) => (prev ? { ...prev, total: prev.total + 1 } : prev));
  };

  const handleSelectConversation = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams);
      params.set("cid", id);
      // On mobile, push so back goes to list; on desktop, replace to avoid history bloat
      if (isMobile) {
        router.push(`${pathname}?${params.toString()}`);
      } else {
        router.replace(`${pathname}?${params.toString()}`);
      }
    },
    [pathname, router, searchParams, isMobile],
  );

  const updateSearchParams = useCallback(
    (opts?: { preserveCid?: boolean }) => {
      const preserveCid = opts?.preserveCid ?? true;
      const params = new URLSearchParams(searchParams);
      if (query) params.set("q", query);
      else params.delete("q");

      // Smart mode: no explicit mode param
      if (typeof timeRange === "string") {
        params.set("time", timeRange);
        params.delete("start");
        params.delete("end");
      } else if (timeRange && timeRange.start && timeRange.end) {
        params.set("time", "custom");
        params.set("start", timeRange.start);
        params.set("end", timeRange.end);
      }
      params.set("size", resultsSize.toString());

      // No per-mode params in Smart mode

      // roles
      if (roles.length === DEFAULT_ROLES.length) {
        params.delete("roles");
      } else if (roles.length > 0) {
        params.set("roles", roles.join(","));
      } else {
        // if empty, keep param to reflect state
        params.set("roles", "");
      }

      // Optionally preserve selected conversation id
      if (preserveCid && selectedIdFromUrl) params.set("cid", selectedIdFromUrl);
      else params.delete("cid");
      router.replace(`${pathname}?${params.toString()}`);
    },
    [query, timeRange, resultsSize, roles, searchParams, router, pathname, selectedIdFromUrl],
  );

  const handleSearch = useCallback(async () => {
    // On mobile detail view, clear selection so results list shows
    const shouldClearCid = isMobile && Boolean(selectedIdFromUrl);
    updateSearchParams({ preserveCid: !shouldClearCid });

    setLoading(true);
    try {
      const body = {
        query,
        searchMode: "smart",
        timeRange,
        size: resultsSize,

        roles,
      };
      console.debug("Sending search request with:", body);

      const response = await fetch("/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      // Debug: Log the search results structure
      console.debug("Search API response:", JSON.stringify(data, null, 2));

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
        console.debug("First result:", {
          id: firstResult._id,
          source: firstResult._source,
        });

        // Check if the first result has messages
        if (firstResult._source?.messages) {
          console.debug("First result messages:", firstResult._source.messages);
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
          }),
        ) || [];

      console.debug("Mapped results:", mappedResults);

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
  }, [query, timeRange, resultsSize, roles, updateSearchParams, isMobile, selectedIdFromUrl]);

  // Create a memoized debounced function for search
  const debouncedSearch = useMemo(() => {
    return debounce(() => {
      console.debug("Debounced search triggered for query:", query);
      handleSearch();
    }, SEARCH_BEHAVIOR_DEFAULTS.searchDebounceMs);
  }, [handleSearch, query]);

  // Debounced search for filter changes (time range, size, roles)
  const debouncedFilterSearch = useMemo(() => {
    return debounce(() => {
      console.debug("Debounced search triggered for filters change");
      handleSearch();
    }, SEARCH_BEHAVIOR_DEFAULTS.filterDebounceMs);
  }, [handleSearch]);

  // Initial load search: Fetch latest entries if query is initially empty
  useEffect(() => {
    if (initialLoad) {
      console.debug("[HomeContent] Initial load detected. Current query:", query);
      // On initial load, if query is empty (or not from URL persisting a specific search),
      // handleSearch will send an empty query, which the backend now treats as 'fetch latest'.
      handleSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLoad]);

  // Apply the debounced search when query changes, respecting minimum length unless query is empty
  useEffect(() => {
    if (!initialLoad) {
      // Only apply debounced search after initial load has completed
      if (query.length === 0 || query.length >= SEARCH_BEHAVIOR_DEFAULTS.minQueryLength) {
        console.debug(`Query is now '${query}', scheduling debounced search.`);
        debouncedSearch();
      } else {
        console.debug(
          `Query is '${query}' (<${SEARCH_BEHAVIOR_DEFAULTS.minQueryLength} chars), cancelling pending debounced search.`,
        );
        debouncedSearch.cancel();
      }
    }

    // Cleanup the debounced function on unmount or when dependencies change
    return () => {
      debouncedSearch.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Trigger search when filters change (but not on the very first mount)
  useEffect(() => {
    if (!initialLoad) {
      // Always trigger; handleSearch will clear selection on mobile detail view
      debouncedFilterSearch();
    }
    return () => {
      debouncedFilterSearch.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange, resultsSize, roles]);

  useEffect(() => {
    const onTypeToSearch = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target && (target as HTMLElement).isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length !== 1) return;

      const candidates = Array.from(document.querySelectorAll("[data-search-input]")) as HTMLInputElement[];
      const input = candidates.find(
        (el) => el.getClientRects().length > 0 && el.offsetWidth > 0 && el.offsetHeight > 0,
      );
      const isFocusedOnSearch = input ? document.activeElement === input : false;
      if (isFocusedOnSearch) {
        setQuery((prev) => prev + e.key);
      } else {
        if (input) {
          // Set the first character typed and focus the input
          e.preventDefault();
          setQuery(e.key);
          input.focus();
          return;
        }
      }
      input?.focus();
    };

    window.addEventListener("keydown", onTypeToSearch);
    return () => window.removeEventListener("keydown", onTypeToSearch);
  }, []);

  useEffect(() => {
    if (searchResults && searchResults.length > 0) {
      console.debug("Rendering search results:", searchResults);
    }
  }, [searchResults]);

  return (
    <div
      className="flex flex-col h-screen"
      style={
        {
          "--search-filters-height": "90px",
          "--search-filters-height-mobile": "60px",
        } as React.CSSProperties
      }
    >
      {/* Desktop top header: full width search + filters separated by shadcn Separator */}
      <div className="hidden sm:block sticky top-0 z-30 bg-background">
        <div className="px-4 py-2">
          <div className="flex gap-2 items-center">
            <div className="flex-1">
              <SearchBar query={query} onQueryChange={setQuery} onSearch={handleSearch} />
            </div>
            <ThemeToggle />
            <LogoutButton />
          </div>
          <div className="mt-2">
            <SearchFilters
              timeRange={timeRange}
              resultsSize={resultsSize}
              roles={roles}
              onTimeRangeChange={setTimeRange}
              onResultsSizeChange={setResultsSize}
              onRolesChange={setRoles}
            />
          </div>
        </div>
        <Separator />
      </div>

      {/* Main content area with results */}
      <div ref={resultsContainerRef} className="flex-1 overflow-y-auto pb-16 sm:pb-0 main-content">
        <div className="px-4 sm:px-6 pb-4 sm:py-4">
          {/* Search results */}
          <div className="mt-0 sm:mt-2">
            {/* Loading state */}
            {loading && (
              <div className="space-y-1 sm:space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="w-full h-[160px] rounded-lg" />
                ))}
              </div>
            )}

            {/* Empty state */}
            {!loading && searchResults && searchResults.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 sm:py-12 text-center">
                <div className="bg-muted/30 p-3 rounded-md mb-3">
                  <MessageSquare className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold mb-2">No conversations found</h3>
                <p className="text-muted-foreground max-w-md">
                  {query
                    ? "Try adjusting your search or filters to find what you're looking for."
                    : "Start searching to find conversations."}
                </p>
              </div>
            )}

            {/* Desktop layout: sidebar + conversation, separated by shadcn Separator */}
            {!loading && searchResults && searchResults.length > 0 && (
              <div className="hidden sm:flex sm:flex-row sm:items-stretch">
                {isSidebarOpen && (
                  <>
                    <div className="w-[320px] shrink-0 pr-2 border-r">
                      <div className="flex items-center justify-between py-1">
                        <div className="text-sm text-muted-foreground">
                          {searchMetadata && searchMetadata.total > 0 ? (
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
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setIsSidebarOpen(false)}
                          aria-label="Hide sidebar"
                        >
                          <PanelLeftClose className="h-4 w-4" />
                        </Button>
                      </div>
                      <Separator />
                      <div className="mt-2">
                        {searchResults.map((result, idx) => (
                          <div key={result.id}>
                            <ConversationListItem
                              id={result.id}
                              created={result.created}
                              model={result.model}
                              messages={result.messages}
                              isActive={selectedIdFromUrl === result.id}
                              onSelect={handleSelectConversation}
                              onDelete={handleDeleteConversation}
                              onRestore={handleRestoreConversation}
                              variant="flat"
                            />
                            {idx < searchResults.length - 1 && <Separator className="my-1" />}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                <div className="flex-1 min-w-0 pl-0 sm:pl-2">
                  {selectedIdFromUrl ? (
                    (() => {
                      const active = searchResults.find((r) => r.id === selectedIdFromUrl);
                      if (!active) return null;
                      return (
                        <ConversationCard
                          key={active.id}
                          id={active.id}
                          created={active.created}
                          model={active.model}
                          usage={active.usage}
                          messages={active.messages}
                          onShowSidebar={!isSidebarOpen ? () => setIsSidebarOpen(true) : undefined}
                          onDelete={handleDeleteConversation}
                          onRestore={handleRestoreConversation}
                          variant="flat"
                        />
                      );
                    })()
                  ) : (
                    <div className="hidden sm:flex h-[60vh] items-center justify-center text-muted-foreground relative">
                      {!isSidebarOpen && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute left-2 top-2 h-7 w-7"
                          onClick={() => setIsSidebarOpen(true)}
                          aria-label="Show sidebar"
                        >
                          <PanelLeftOpen className="h-4 w-4" />
                        </Button>
                      )}
                      <span className="ml-2">Select a conversation to view</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* List (mobile) */}
            {!loading && !selectedIdFromUrl && searchResults && searchResults.length > 0 && (
              <div className="sm:hidden">
                <div>
                  {searchResults.map((result, idx) => (
                    <div key={result.id}>
                      <ConversationListItem
                        id={result.id}
                        created={result.created}
                        model={result.model}
                        messages={result.messages}
                        isActive={selectedIdFromUrl === result.id}
                        onSelect={handleSelectConversation}
                        onDelete={handleDeleteConversation}
                        onRestore={handleRestoreConversation}
                        variant="flat"
                      />
                      {idx < searchResults.length - 1 && <Separator className="my-1" />}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Detail (mobile) */}
            {!loading && selectedIdFromUrl && searchResults && (
              <div className="sm:hidden">
                {(() => {
                  const active = searchResults.find((r) => r.id === selectedIdFromUrl);
                  if (!active) return null;
                  return (
                    <ConversationCard
                      key={active.id}
                      id={active.id}
                      created={active.created}
                      model={active.model}
                      usage={active.usage}
                      messages={active.messages}
                      onDelete={handleDeleteConversation}
                    />
                  );
                })()}
              </div>
            )}

            {/* Initial empty state */}
            {initialLoad && !loading && !searchResults && (
              <div className="flex flex-col items-center justify-center py-12 sm:py-16 text-center">
                <div className="bg-muted/30 p-4 rounded-md mb-4">
                  <Search className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg sm:text-xl font-semibold mb-2">Search your conversations</h3>
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
            {selectedIdFromUrl && (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-3 rounded-md"
                onClick={() => {
                  // Always clear selection to return to list on mobile
                  const params = new URLSearchParams(searchParams);
                  params.delete("cid");
                  router.replace(`${pathname}?${params.toString()}`);
                }}
                aria-label="Back to results"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="flex-1">
              <SearchBar query={query} onQueryChange={setQuery} onSearch={handleSearch} isCompact={true} />
            </div>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9 rounded-md">
                  <Settings className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-[80vh] overflow-y-auto">
                <SheetHeader className="mb-4">
                  <SheetTitle>Search Settings</SheetTitle>
                  <SheetDescription>Adjust your search filters and preferences</SheetDescription>
                </SheetHeader>
                <div className="flex justify-between items-center mb-4">
                  <div />
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setTimeRange(FILTERS_DEFAULTS.timeRange);
                        setResultsSize(FILTERS_DEFAULTS.resultsSize);
                      }}
                    >
                      Reset filters
                    </Button>
                    <ThemeToggle />
                    <LogoutButton />
                  </div>
                </div>
                <div className="pb-16">
                  <SearchFilters
                    timeRange={timeRange}
                    resultsSize={resultsSize}
                    roles={roles}
                    onTimeRangeChange={setTimeRange}
                    onResultsSizeChange={setResultsSize}
                    onRolesChange={setRoles}
                    alwaysExpanded={true}
                  />
                </div>
              </SheetContent>
            </Sheet>
          </div>
          {!selectedIdFromUrl && searchMetadata && (
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
          className="fixed bottom-20 right-4 sm:bottom-4 sm:right-4 z-30 rounded-md shadow-md scroll-to-top-button"
          onClick={scrollToTop}
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

// Disable static generation since this page uses search parameters
export const dynamic = "force-dynamic";

// Main component that wraps the content with Suspense
export default function Home() {
  return (
    <Suspense fallback={<div className="p-4">Loading...</div>}>
      <HomeContent />
    </Suspense>
  );
}
