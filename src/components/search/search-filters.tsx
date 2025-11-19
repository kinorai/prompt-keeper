import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Calendar, Filter, SlidersHorizontal } from "lucide-react";
import { FilterBadge } from "@/components/badges";
import { RangeCalendarWithPresets } from "@/components/ui/range-calendar-with-presets";
import type { DateRange } from "react-day-picker";
import { labelForTimeRange, toCustomRangeFromDateRange, toDateRange } from "@/lib/date";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { DEFAULT_ROLES, FILTERS_DEFAULTS } from "@/lib/defaults";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface CustomRange {
  start: string;
  end: string;
}

interface SearchFiltersProps {
  timeRange: string | CustomRange;
  resultsSize: number;
  roles?: string[];
  onTimeRangeChange: (value: string | CustomRange) => void;
  onResultsSizeChange: (value: number) => void;
  onRolesChange?: (roles: string[]) => void;
  alwaysExpanded?: boolean;
}

export function SearchFilters({
  timeRange,
  resultsSize,
  roles = [...DEFAULT_ROLES],
  onTimeRangeChange,
  onResultsSizeChange,
  onRolesChange,
  alwaysExpanded = false,
}: SearchFiltersProps) {
  // Subcomponents to DRY repeated UI
  function RolesToggle({ value, onChange }: { value: string[]; onChange?: (next: string[]) => void }) {
    return (
      <div className="flex flex-col gap-2.5">
        <Label className="text-sm font-medium">Filter by sender</Label>
        <ToggleGroup
          type="multiple"
          className="rounded-md w-full"
          value={value}
          onValueChange={(vals) => onChange?.(vals as string[])}
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
    );
  }

  function ResultsSizeControl({ value, onChange }: { value: number; onChange: (next: number) => void }) {
    return (
      <div className="flex flex-col gap-2.5">
        <Label className="text-sm font-medium">Results Size</Label>
        <div className="flex gap-4 items-center">
          <Slider
            value={[value]}
            onValueChange={([v]) => onChange(v)}
            min={10}
            max={1000}
            step={10}
            className="w-full"
          />
          <span className="text-sm font-medium w-12 text-center">{value}</span>
        </div>
      </div>
    );
  }

  const timeRangeLabel = labelForTimeRange(timeRange);

  const handleCalendarChange = (range?: DateRange) => {
    onTimeRangeChange(toCustomRangeFromDateRange(range));
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
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 p-3 rounded-lg">
          <RolesToggle value={roles} onChange={onRolesChange} />
          <ResultsSizeControl value={resultsSize} onChange={onResultsSizeChange} />
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

                  onRolesChange?.([...DEFAULT_ROLES]);
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 p-3 sm:p-5 rounded-lg border mt-2">
            {/* Left: Calendar */}
            <div className="flex flex-col gap-2.5">
              <Label className="text-sm font-medium">Time Range</Label>
              <RangeCalendarWithPresets value={toDateRange(timeRange)} onChange={handleCalendarChange} />
            </div>

            {/* Right: All other controls stacked */}
            <div className="flex flex-col gap-4">
              <RolesToggle value={roles} onChange={onRolesChange} />
              <ResultsSizeControl value={resultsSize} onChange={onResultsSizeChange} />
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
