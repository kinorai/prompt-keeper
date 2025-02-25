import { formatDistanceToNow } from "date-fns";
import {
  Copy,
  FileJson,
  MessageSquare,
  Bot,
  User,
  Clock,
  Zap,
  Award,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState } from "react";

interface ConversationCardProps {
  conversation: {
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
  };
}

export function ConversationCard({ conversation }: ConversationCardProps) {
  const { _source: source, _score, highlight } = conversation;
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const copyToClipboard = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const copyFullConversation = async () => {
    try {
      const text = source.messages
        .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
        .join("\n\n");
      await navigator.clipboard.writeText(text);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch (err) {
      console.error("Failed to copy full conversation:", err);
    }
  };

  return (
    <div className="rounded-xl border bg-card shadow-sm transition-all hover:shadow-md overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b p-3 sm:p-4 bg-muted/10">
        <div className="flex flex-wrap items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className="flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full bg-background text-xs"
                >
                  <MessageSquare className="h-3 w-3" />
                  {source.model}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Model</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className="flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full bg-background text-xs"
                >
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(source.timestamp), {
                    addSuffix: true,
                  })}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Time</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="secondary"
                  className="flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-xs"
                >
                  <Zap className="h-3 w-3" />
                  {source.usage?.total_tokens || "n/a"} tokens
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                Prompt: {source.usage?.prompt_tokens || "n/a"} | Completion:{" "}
                {source.usage?.completion_tokens || "n/a"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {source.latency && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="secondary"
                    className="flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-xs"
                  >
                    <Clock className="h-3 w-3" />
                    {source.latency}ms
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>Latency</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {_score && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="secondary"
                    className="flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-xs"
                  >
                    <Award className="h-3 w-3" />
                    {_score.toFixed(2)}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>Match Score</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        <div className="flex gap-2 mt-2 sm:mt-0">
          <Button
            variant="outline"
            size="sm"
            onClick={copyFullConversation}
            className="h-7 sm:h-8 text-xs rounded-full bg-background"
          >
            {copiedAll ? (
              <>
                <Check className="h-3 sm:h-3.5 w-3 sm:w-3.5 mr-1 text-green-500" />
                <span className="text-green-500">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3 sm:h-3.5 w-3 sm:w-3.5 mr-1" />
                Copy All
              </>
            )}
          </Button>

          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 sm:h-8 text-xs rounded-full bg-background"
              >
                <FileJson className="h-3 sm:h-3.5 w-3 sm:w-3.5 mr-1" />
                Raw JSON
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-full sm:max-w-4xl max-h-[80vh] p-4 sm:p-6">
              <DialogHeader>
                <DialogTitle>Raw Response</DialogTitle>
              </DialogHeader>
              <div className="overflow-auto max-h-[calc(80vh-8rem)]">
                <pre className="bg-muted p-3 sm:p-4 rounded-lg text-xs">
                  <code>{JSON.stringify(source.raw_response, null, 2)}</code>
                </pre>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Collapsible
        open={isExpanded}
        onOpenChange={setIsExpanded}
        className="space-y-0"
      >
        <div className="space-y-0 divide-y divide-border/40">
          {source.messages
            .slice(0, isExpanded ? undefined : 2)
            .map((message, i) => (
              <div
                key={i}
                className={cn(
                  "p-3 sm:p-5",
                  message.role === "assistant" ? "bg-muted/10" : "bg-background"
                )}
              >
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <Badge
                    variant="outline"
                    className={cn(
                      "capitalize flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-xs",
                      message.role === "assistant"
                        ? "text-primary bg-primary/10 border-primary/20"
                        : "text-muted-foreground bg-muted/20"
                    )}
                  >
                    {message.role === "assistant" ? (
                      <Bot className="h-3 w-3" />
                    ) : (
                      <User className="h-3 w-3" />
                    )}
                    {message.role}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 sm:h-7 sm:w-7 rounded-full"
                    onClick={() => copyToClipboard(message.content, i)}
                  >
                    {copiedIndex === i ? (
                      <Check className="h-3 sm:h-3.5 w-3 sm:w-3.5 text-green-500" />
                    ) : (
                      <Copy className="h-3 sm:h-3.5 w-3 sm:w-3.5" />
                    )}
                  </Button>
                </div>
                <div className="prose prose-sm dark:prose-invert max-w-none text-xs sm:text-sm">
                  {highlight && message.role === "assistant" ? (
                    <div
                      dangerouslySetInnerHTML={{
                        __html: highlight["messages.content"].join("\n"),
                      }}
                    />
                  ) : (
                    message.content
                  )}
                </div>
              </div>
            ))}
        </div>

        {source.messages.length > 2 && (
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="w-full rounded-none border-t h-8 sm:h-9 text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {isExpanded
                ? "Show Less"
                : `Show ${source.messages.length - 2} More Messages`}
            </Button>
          </CollapsibleTrigger>
        )}

        <CollapsibleContent className="space-y-0 divide-y divide-border/40">
          {source.messages.slice(2).map((message, i) => (
            <div
              key={i + 2}
              className={cn(
                "p-3 sm:p-5",
                message.role === "assistant" ? "bg-muted/10" : "bg-background"
              )}
            >
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <Badge
                  variant="outline"
                  className={cn(
                    "capitalize flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-xs",
                    message.role === "assistant"
                      ? "text-primary bg-primary/10 border-primary/20"
                      : "text-muted-foreground bg-muted/20"
                  )}
                >
                  {message.role === "assistant" ? (
                    <Bot className="h-3 w-3" />
                  ) : (
                    <User className="h-3 w-3" />
                  )}
                  {message.role}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 sm:h-7 sm:w-7 rounded-full"
                  onClick={() => copyToClipboard(message.content, i + 2)}
                >
                  {copiedIndex === i + 2 ? (
                    <Check className="h-3 sm:h-3.5 w-3 sm:w-3.5 text-green-500" />
                  ) : (
                    <Copy className="h-3 sm:h-3.5 w-3 sm:w-3.5" />
                  )}
                </Button>
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none text-xs sm:text-sm">
                {highlight && message.role === "assistant" ? (
                  <div
                    dangerouslySetInnerHTML={{
                      __html: highlight["messages.content"].join("\n"),
                    }}
                  />
                ) : (
                  message.content
                )}
              </div>
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
