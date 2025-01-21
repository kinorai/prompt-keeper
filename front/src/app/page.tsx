"use client";

import { useCallback, useEffect, useState } from "react";
import { useDebounce } from "use-debounce";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';

interface SearchResult {
  timestamp: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  response: {
    choices: Array<{
      message: {
        role: string;
        content: string;
      };
    }>;
  };
  raw_response: any;
  total_tokens: number;
  latency_ms: number;
  match_score: number;
}

interface SearchResponse {
  results: SearchResult[];
  total_results: number;
  query_time_ms: number;
}

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery] = useDebounce(searchQuery, 300);
  const [minScore, setMinScore] = useState(60);
  const [limit, setLimit] = useState(10);
  const [timeRange, setTimeRange] = useState("all");
  const [searchMode, setSearchMode] = useState("fuzzy");
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null);

  // Load saved state from localStorage
  useEffect(() => {
    const savedQuery = localStorage.getItem("searchQuery");
    const savedResults = localStorage.getItem("searchResults");
    const savedSearchMode = localStorage.getItem("searchMode");
    if (savedQuery) setSearchQuery(savedQuery);
    if (savedResults) setSearchResults(JSON.parse(savedResults));
    if (savedSearchMode) setSearchMode(savedSearchMode);
  }, []);

  // Save state to localStorage
  useEffect(() => {
    localStorage.setItem("searchQuery", searchQuery);
    localStorage.setItem("searchMode", searchMode);
    if (searchResults) {
      localStorage.setItem("searchResults", JSON.stringify(searchResults));
    }
  }, [searchQuery, searchResults, searchMode]);

  const performSearch = useCallback(async () => {
    if (debouncedQuery.length < 3) {
      setSearchResults(null);
      return;
    }

    try {
      const response = await fetch(`/api/search`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          query: debouncedQuery,
          min_score: minScore,
          limit,
          search_mode: searchMode,
          time_range: timeRange,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }

      const data = await response.json();
      setSearchResults(data);
    } catch (error) {
      console.error("Search failed:", error);
      setSearchResults(null);
    }
  }, [debouncedQuery, minScore, limit, searchMode, timeRange]);

  useEffect(() => {
    performSearch();
  }, [debouncedQuery, minScore, limit, timeRange, searchMode, performSearch]);

  return (
    <main className="container mx-auto p-4 space-y-4">
      <div className="flex items-center space-x-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            type="search"
            placeholder="Search prompts and responses..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={searchMode} onValueChange={setSearchMode}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Search mode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fuzzy">Fuzzy Search</SelectItem>
            <SelectItem value="keyword">Keyword Search</SelectItem>
            <SelectItem value="regex">Regex Search</SelectItem>
          </SelectContent>
        </Select>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Time range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All time</SelectItem>
            <SelectItem value="hour">Last hour</SelectItem>
            <SelectItem value="day">Last 24 hours</SelectItem>
            <SelectItem value="week">Last week</SelectItem>
            <SelectItem value="month">Last month</SelectItem>
            <SelectItem value="year">Last year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {searchResults && (
        <div className="text-sm text-muted-foreground">
          Found {searchResults.total_results} results in {searchResults.query_time_ms}ms
        </div>
      )}

      <ScrollArea className="h-[calc(100vh-200px)]">
        <div className="space-y-4">
          {searchResults?.results.map((result, index) => (
            <Card key={index} className="p-4 space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {new Date(result.timestamp).toLocaleString()}
                  </span>
                  <Badge variant="secondary">{result.model}</Badge>
                  <span className="text-sm text-muted-foreground">
                    Tokens: {result.total_tokens} | Latency: {result.latency_ms}ms | Match: {result.match_score}%
                  </span>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      Raw Response
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Raw Response</DialogTitle>
                    </DialogHeader>
                    <ScrollArea className="max-h-[600px]">
                      <pre className="p-4 bg-muted rounded-lg overflow-auto">
                        <code>{JSON.stringify(result.raw_response, null, 2)}</code>
                      </pre>
                    </ScrollArea>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="space-y-4">
                {result.messages.map((msg, msgIndex) => (
                  <div
                    key={msgIndex}
                    className={`p-4 rounded-lg ${
                      msg.role === "assistant"
                        ? "bg-primary/10"
                        : msg.role === "system"
                        ? "bg-accent/10"
                        : "bg-muted"
                    }`}
                  >
                    <div className="font-bold mb-2 capitalize">
                      {msg.role}
                    </div>
                    <ReactMarkdown 
                      className="prose dark:prose-invert max-w-none"
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeRaw, rehypeSanitize]}
                      components={{
                        code({node, inline, className, children, ...props}) {
                          const match = /language-(\w+)/.exec(className || '');
                          const language = match ? match[1] : '';
                          
                          if (!inline && language) {
                            return (
                              <SyntaxHighlighter
                                style={oneDark}
                                language={language}
                                PreTag="div"
                                className="rounded-md"
                                {...props}
                              >
                                {String(children).replace(/\n$/, '')}
                              </SyntaxHighlighter>
                            );
                          }
                          
                          return (
                            <code className={className} {...props}>
                              {children}
                            </code>
                          );
                        }
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ))}
                {result.response?.choices?.[0]?.message && (
                  <div className="p-4 rounded-lg bg-primary/10">
                    <div className="font-bold mb-2 capitalize">
                      {result.response.choices[0].message.role}
                    </div>
                    <ReactMarkdown 
                      className="prose dark:prose-invert max-w-none"
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeRaw, rehypeSanitize]}
                      components={{
                        code({node, inline, className, children, ...props}) {
                          const match = /language-(\w+)/.exec(className || '');
                          const language = match ? match[1] : '';
                          
                          if (!inline && language) {
                            return (
                              <SyntaxHighlighter
                                style={oneDark}
                                language={language}
                                PreTag="div"
                                className="rounded-md"
                                {...props}
                              >
                                {String(children).replace(/\n$/, '')}
                              </SyntaxHighlighter>
                            );
                          }
                          
                          return (
                            <code className={className} {...props}>
                              {children}
                            </code>
                          );
                        }
                      }}
                    >
                      {result.response.choices[0].message.content}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </main>
  );
}
