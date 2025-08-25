"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Calendar, Filter, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface SearchFiltersProps {
  timeRange: string;
  resultsSize: number;
  fuzzyConfig: {
    fuzziness: string;
    prefixLength: number;
  };
  searchMode: string;
  onTimeRangeChange: (value: string) => void;
  onResultsSizeChange: (value: number) => void;
  onFuzzyConfigChange: (config: { fuzziness: string; prefixLength: number }) => void;
  alwaysExpanded?: boolean;
}

export function SearchFilters({
  timeRange,
  resultsSize,
  fuzzyConfig,
  searchMode,
  onTimeRangeChange,
  onResultsSizeChange,
  onFuzzyConfigChange,
  alwaysExpanded = false,
}: SearchFiltersProps) {
  // If alwaysExpanded is true, render the content directly without the accordion
  if (alwaysExpanded) {
    return (
      <div className="w-full">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filters</span>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary" className="text-xs font-normal py-0 px-1.5">
              <Calendar className="mr-1 h-3 w-3" />
              {timeRange === "1h"
                ? "Last hour"
                : timeRange === "1d"
                  ? "Last 24 hours"
                  : timeRange === "1m"
                    ? "Last month"
                    : timeRange === "1y"
                      ? "Last year"
                      : "All time"}
            </Badge>
            <Badge variant="secondary" className="text-xs font-normal py-0 px-1.5">
              <SlidersHorizontal className="mr-1 h-3 w-3" />
              {resultsSize} results
            </Badge>
            {searchMode === "fuzzy" && (
              <Badge variant="secondary" className="text-xs font-normal py-0 px-1.5">
                Fuzziness: {fuzzyConfig.fuzziness}
              </Badge>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 p-3 bg-muted/20 rounded-xl">
          <div className="flex flex-col gap-2.5">
            <Label className="text-sm font-medium">Time Range</Label>
            <Select value={timeRange} onValueChange={onTimeRangeChange}>
              <SelectTrigger className="w-full h-9 rounded-lg bg-background">
                <SelectValue placeholder="Select range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1h">Last hour</SelectItem>
                <SelectItem value="1d">Last 24 hours</SelectItem>
                <SelectItem value="1m">Last month</SelectItem>
                <SelectItem value="1y">Last year</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2.5">
            <Label className="text-sm font-medium">Results Size</Label>
            <div className="flex gap-4 items-center">
              <Slider
                value={[resultsSize]}
                onValueChange={([value]) => onResultsSizeChange(value)}
                min={1}
                max={100}
                step={1}
                className="w-full"
              />
              <span className="text-sm font-medium w-12 text-center">{resultsSize}</span>
            </div>
          </div>

          {searchMode === "fuzzy" && (
            <>
              <div className="flex flex-col gap-2.5">
                <Label className="text-sm font-medium">Fuzziness</Label>
                <Select
                  value={fuzzyConfig.fuzziness}
                  onValueChange={(value) => onFuzzyConfigChange({ ...fuzzyConfig, fuzziness: value })}
                >
                  <SelectTrigger className="w-full h-9 rounded-lg bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AUTO">Auto</SelectItem>
                    <SelectItem value="0">0</SelectItem>
                    <SelectItem value="1">1</SelectItem>
                    <SelectItem value="2">2</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2.5">
                <Label className="text-sm font-medium">Prefix Length</Label>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  value={fuzzyConfig.prefixLength}
                  onChange={(e) =>
                    onFuzzyConfigChange({
                      ...fuzzyConfig,
                      prefixLength: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-full h-9 rounded-lg bg-background"
                />
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // Default accordion behavior for desktop
  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value="filters" className="border-none">
        <AccordionTrigger className="text-sm font-medium hover:no-underline">
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span>Filters</span>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="secondary" className="text-xs font-normal py-0 px-1.5">
                <Calendar className="mr-1 h-3 w-3" />
                {timeRange === "1h"
                  ? "Last hour"
                  : timeRange === "1d"
                    ? "Last 24 hours"
                    : timeRange === "1m"
                      ? "Last month"
                      : timeRange === "1y"
                        ? "Last year"
                        : "All time"}
              </Badge>
              <Badge variant="secondary" className="text-xs font-normal py-0 px-1.5">
                <SlidersHorizontal className="mr-1 h-3 w-3" />
                {resultsSize} results
              </Badge>
              {searchMode === "fuzzy" && (
                <Badge variant="secondary" className="text-xs font-normal py-0 px-1.5">
                  Fuzziness: {fuzzyConfig.fuzziness}
                </Badge>
              )}
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 p-3 sm:p-5 bg-muted/20 rounded-xl mt-2">
            <div className="flex flex-col gap-2.5">
              <Label className="text-sm font-medium">Time Range</Label>
              <Select value={timeRange} onValueChange={onTimeRangeChange}>
                <SelectTrigger className="w-full h-9 sm:h-10 rounded-lg bg-background">
                  <SelectValue placeholder="Select range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">Last hour</SelectItem>
                  <SelectItem value="1d">Last 24 hours</SelectItem>
                  <SelectItem value="1m">Last month</SelectItem>
                  <SelectItem value="1y">Last year</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2.5">
              <Label className="text-sm font-medium">Results Size</Label>
              <div className="flex gap-4 items-center">
                <Slider
                  value={[resultsSize]}
                  onValueChange={([value]) => onResultsSizeChange(value)}
                  min={1}
                  max={100}
                  step={1}
                  className="w-full"
                />
                <span className="text-sm font-medium w-12 text-center">{resultsSize}</span>
              </div>
            </div>

            {searchMode === "fuzzy" && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2.5">
                  <Label className="text-sm font-medium">Fuzziness</Label>
                  <Select
                    value={fuzzyConfig.fuzziness}
                    onValueChange={(value) => onFuzzyConfigChange({ ...fuzzyConfig, fuzziness: value })}
                  >
                    <SelectTrigger className="w-full h-9 sm:h-10 rounded-lg bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AUTO">Auto</SelectItem>
                      <SelectItem value="0">0</SelectItem>
                      <SelectItem value="1">1</SelectItem>
                      <SelectItem value="2">2</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-2.5">
                  <Label className="text-sm font-medium">Prefix Length</Label>
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    value={fuzzyConfig.prefixLength}
                    onChange={(e) =>
                      onFuzzyConfigChange({
                        ...fuzzyConfig,
                        prefixLength: parseInt(e.target.value) || 0,
                      })
                    }
                    className="w-full h-9 sm:h-10 rounded-lg bg-background"
                  />
                </div>
              </div>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
