import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Calendar, Filter, SlidersHorizontal } from "lucide-react";
import { FilterBadge } from "@/components/badges";
import { RangeCalendarWithPresets } from "@/components/ui/range-calendar-with-presets";
import type { DateRange } from "react-day-picker";
import { endOfDay, format, startOfDay, subMonths, startOfYear } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { FILTERS_DEFAULTS } from "@/lib/defaults";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface CustomRange {
  start: string;
  end: string;
}

interface SearchFiltersProps {
  timeRange: string | CustomRange;
  resultsSize: number;
  fuzzyConfig: {
    fuzziness: string;
    prefixLength: number;
  };
  searchMode: string;
  roles?: string[];
  onTimeRangeChange: (value: string | CustomRange) => void;
  onResultsSizeChange: (value: number) => void;
  onFuzzyConfigChange: (config: { fuzziness: string; prefixLength: number }) => void;
  onRolesChange?: (roles: string[]) => void;
  alwaysExpanded?: boolean;
}

export function SearchFilters({
  timeRange,
  resultsSize,
  fuzzyConfig,
  searchMode,
  roles = ["system", "user", "assistant"],
  onTimeRangeChange,
  onResultsSizeChange,
  onFuzzyConfigChange,
  onRolesChange,
  alwaysExpanded = false,
}: SearchFiltersProps) {
  const timeRangeLabel = (() => {
    if (typeof timeRange === "string") {
      return timeRange === "1h"
        ? "Last hour"
        : timeRange === "1d"
          ? "Last 24 hours"
          : timeRange === "1m"
            ? "Last month"
            : timeRange === "1y"
              ? "Last year"
              : "All time";
    }
    try {
      const start = new Date(timeRange.start);
      const end = new Date(timeRange.end);
      const sameDay = start.toDateString() === end.toDateString();
      return sameDay
        ? `${format(start, "dd MMM yyyy")}`
        : `${format(start, "dd MMM yyyy")} → ${format(end, "dd MMM yyyy")}`;
    } catch {
      return "Custom range";
    }
  })();

  const toDateRange = (value: string | CustomRange): DateRange | undefined => {
    const today = new Date();
    if (typeof value !== "string") {
      const from = new Date(value.start);
      const to = new Date(value.end);
      return { from, to };
    }
    switch (value) {
      case "1h":
      case "1d":
        return { from: today, to: today };
      case "1m": {
        const from = subMonths(today, 1);
        return { from, to: today };
      }
      case "1y": {
        const from = startOfYear(today);
        return { from, to: today };
      }
      case "all":
      default:
        return undefined;
    }
  };

  const handleCalendarChange = (range?: DateRange) => {
    if (range?.from && range?.to) {
      onTimeRangeChange({ start: startOfDay(range.from).toISOString(), end: endOfDay(range.to).toISOString() });
    } else if (!range) {
      onTimeRangeChange("all");
    }
  };

  // If alwaysExpanded is true, render the content directly without the accordion
  if (alwaysExpanded) {
    return (
      <div className="w-full">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filters</span>
          <div className="flex flex-wrap gap-1.5">
            <FilterBadge>
              <Calendar className="mr-1 h-3 w-3" />
              {timeRangeLabel}
            </FilterBadge>
            <FilterBadge>
              <SlidersHorizontal className="mr-1 h-3 w-3" />
              {resultsSize} results
            </FilterBadge>
            {searchMode === "fuzzy" && <FilterBadge>Fuzziness: {fuzzyConfig.fuzziness}</FilterBadge>}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 p-3 bg-muted/20 rounded-lg">
          <div className="flex flex-col gap-2.5">
            <Label className="text-sm font-medium">Filter by sender</Label>
            <ToggleGroup
              type="multiple"
              className="rounded-md w-full"
              value={roles}
              onValueChange={(vals) => onRolesChange?.(vals as string[])}
            >
              <ToggleGroupItem
                value="system"
                aria-label="Filter system"
                className="rounded-none first:rounded-l-md last:rounded-r-md flex-1"
              >
                <span className="text-sm">system</span>
              </ToggleGroupItem>
              <ToggleGroupItem
                value="user"
                aria-label="Filter user"
                className="rounded-none first:rounded-l-md last:rounded-r-md flex-1"
              >
                <span className="text-sm">user</span>
              </ToggleGroupItem>
              <ToggleGroupItem
                value="assistant"
                aria-label="Filter assistant"
                className="rounded-none first:rounded-l-md last:rounded-r-md flex-1"
              >
                <span className="text-sm">assistant</span>
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="flex flex-col gap-2.5">
            <Label className="text-sm font-medium">Results Size</Label>
            <div className="flex gap-4 items-center">
              <Slider
                value={[resultsSize]}
                onValueChange={([value]) => onResultsSizeChange(value)}
                min={10}
                max={1000}
                step={10}
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
                  <SelectTrigger className="w-full h-9 rounded-md bg-background">
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
                  className="w-full h-9 rounded-md bg-background"
                />
              </div>
            </>
          )}
        </div>
        <div className="flex flex-col gap-2.5">
          <Label className="text-sm font-medium">Time Range</Label>
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="w-full h-9 rounded-md bg-background border text-left px-3 inline-flex items-center gap-2"
                aria-label="Select time range"
              >
                <Calendar className="h-4 w-4" />
                <span className="truncate">{timeRangeLabel}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="p-2">
              <RangeCalendarWithPresets value={toDateRange(timeRange)} onChange={handleCalendarChange} />
            </PopoverContent>
          </Popover>
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
              <FilterBadge>
                <Calendar className="mr-1 h-3 w-3" />
                {timeRangeLabel}
              </FilterBadge>
              <FilterBadge>
                <SlidersHorizontal className="mr-1 h-3 w-3" />
                {resultsSize} results
              </FilterBadge>
              {searchMode === "fuzzy" && <FilterBadge>Fuzziness: {fuzzyConfig.fuzziness}</FilterBadge>}
            </div>
            <div className="ml-auto hidden sm:flex">
              <Button
                asChild
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onTimeRangeChange(FILTERS_DEFAULTS.timeRange);
                  onResultsSizeChange(FILTERS_DEFAULTS.resultsSize);
                  if (searchMode === "fuzzy") {
                    onFuzzyConfigChange({
                      fuzziness: FILTERS_DEFAULTS.fuzziness,
                      prefixLength: FILTERS_DEFAULTS.prefixLength,
                    });
                  }
                  onRolesChange?.(["system", "user", "assistant"]);
                }}
              >
                <span role="button" tabIndex={0}>
                  Reset filters
                </span>
              </Button>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 p-3 sm:p-5 bg-muted/20 rounded-lg mt-2">
            {/* Left: Calendar */}
            <div className="flex flex-col gap-2.5">
              <Label className="text-sm font-medium">Time Range</Label>
              <RangeCalendarWithPresets value={toDateRange(timeRange)} onChange={handleCalendarChange} />
            </div>

            {/* Right: All other controls stacked */}
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2.5">
                <Label className="text-sm font-medium">Filter by sender</Label>
                <ToggleGroup
                  type="multiple"
                  className="rounded-md w-full"
                  value={roles}
                  onValueChange={(vals) => onRolesChange?.(vals as string[])}
                >
                  <ToggleGroupItem
                    value="system"
                    aria-label="Filter system"
                    className="rounded-none first:rounded-l-md last:rounded-r-md flex-1"
                  >
                    <span className="text-sm">system</span>
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="user"
                    aria-label="Filter user"
                    className="rounded-none first:rounded-l-md last:rounded-r-md flex-1"
                  >
                    <span className="text-sm">user</span>
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="assistant"
                    aria-label="Filter assistant"
                    className="rounded-none first:rounded-l-md last:rounded-r-md flex-1"
                  >
                    <span className="text-sm">assistant</span>
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
              <div className="flex flex-col gap-2.5">
                <Label className="text-sm font-medium">Results Size</Label>
                <div className="flex gap-4 items-center">
                  <Slider
                    value={[resultsSize]}
                    onValueChange={([value]) => onResultsSizeChange(value)}
                    min={10}
                    max={1000}
                    step={10}
                    className="w-full"
                  />
                  <span className="text-sm font-medium w-12 text-center">{resultsSize}</span>
                </div>
              </div>

              {searchMode === "fuzzy" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2.5">
                    <Label className="text-sm font-medium">Fuzziness</Label>
                    <Select
                      value={fuzzyConfig.fuzziness}
                      onValueChange={(value) => onFuzzyConfigChange({ ...fuzzyConfig, fuzziness: value })}
                    >
                      <SelectTrigger className="w-full h-9 sm:h-10 rounded-md bg-background">
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
                      className="w-full h-9 sm:h-10 rounded-md bg-background"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
