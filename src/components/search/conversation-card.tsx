import { formatDistanceToNow } from "date-fns";
import { Copy, FileJson } from "lucide-react";
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

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Badge variant="outline">{source.model}</Badge>
        <span className="text-sm text-muted-foreground">
          {formatDistanceToNow(new Date(source.timestamp), { addSuffix: true })}
        </span>
        <Badge variant="secondary">
          {source.usage?.total_tokens || "n/a"} tokens
        </Badge>
        <Badge variant="secondary">{source.latency}ms</Badge>
        {_score && (
          <Badge variant="secondary">Score: {_score.toFixed(2)}</Badge>
        )}
      </div>

      <div className="space-y-4">
        {source.messages.map((message, i) => (
          <div
            key={i}
            className={cn(
              "rounded-lg p-4",
              message.role === "assistant"
                ? "bg-muted/50"
                : "border border-border/50"
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <Badge variant="outline" className="capitalize">
                {message.role}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => copyToClipboard(message.content)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <div className="prose prose-sm dark:prose-invert max-w-none">
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

      <div className="flex justify-end gap-2 mt-4">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <FileJson className="h-4 w-4 mr-2" />
              Raw Response
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Raw Response</DialogTitle>
            </DialogHeader>
            <pre className="bg-muted p-4 rounded-lg overflow-auto max-h-[600px]">
              <code>{JSON.stringify(source.raw_response, null, 2)}</code>
            </pre>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
