import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

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
  onFuzzyConfigChange: (config: {
    fuzziness: string;
    prefixLength: number;
  }) => void;
}

export function SearchFilters({
  timeRange,
  resultsSize,
  fuzzyConfig,
  searchMode,
  onTimeRangeChange,
  onResultsSizeChange,
  onFuzzyConfigChange,
}: SearchFiltersProps) {
  return (
    <div className="flex flex-wrap gap-6 p-4 bg-muted/30 rounded-lg">
      <div className="flex flex-col gap-2">
        <Label>Time Range</Label>
        <Select value={timeRange} onValueChange={onTimeRangeChange}>
          <SelectTrigger className="w-[140px]">
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

      <div className="flex flex-col gap-2">
        <Label>Results Size</Label>
        <div className="flex gap-4 items-center">
          <Slider
            value={[resultsSize]}
            onValueChange={([value]) => onResultsSizeChange(value)}
            min={10}
            max={100}
            step={10}
            className="w-[140px]"
          />
          <span className="text-sm text-muted-foreground w-12">
            {resultsSize}
          </span>
        </div>
      </div>

      {searchMode === "fuzzy" && (
        <div className="flex gap-4">
          <div className="flex flex-col gap-2">
            <Label>Fuzziness</Label>
            <Select
              value={fuzzyConfig.fuzziness}
              onValueChange={(value) =>
                onFuzzyConfigChange({ ...fuzzyConfig, fuzziness: value })
              }
            >
              <SelectTrigger className="w-[100px]">
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

          <div className="flex flex-col gap-2">
            <Label>Prefix Length</Label>
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
              className="w-[100px]"
            />
          </div>
        </div>
      )}
    </div>
  );
}
