import { notFound } from "next/navigation";
import opensearchClient, { PROMPT_KEEPER_INDEX, ensureIndexExists } from "@/lib/opensearch";
import { ConversationCard } from "@/components/search/conversation-card";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface SearchHitSource {
  timestamp?: string;
  model?: string;
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
}

export default async function Page({ params }: { params: { id: string } }) {
  const { id } = params;

  try {
    await ensureIndexExists();

    const response = await opensearchClient.get({
      index: PROMPT_KEEPER_INDEX,
      id,
    });

    // If OS says not found, 404
    if (!response.body?.found) {
      return notFound();
    }

    const src = (response.body._source || {}) as SearchHitSource;

    const created = src.timestamp || new Date().toISOString();
    const model = src.model || "Unknown";
    const usage = src.usage || undefined;
    const messages = src.messages || [];

    return (
      <div className="container py-3 sm:py-6">
        {/* Mobile back button */}
        <div className="sm:hidden mb-3">
          <Link href="/" prefetch={false}>
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="h-4 w-4" />
              Back to results
            </Button>
          </Link>
        </div>

        <ConversationCard
          id={id}
          created={created}
          model={model}
          usage={usage}
          messages={messages}
          showInlineActions={false}
        />
      </div>
    );
  } catch (error) {
    // Treat any error as not found for a clean UX
    console.error(error);
    return notFound();
  }
}
