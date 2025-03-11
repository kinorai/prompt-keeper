import asyncio
import random
from datetime import datetime, timedelta, UTC
import json
from opensearchpy import OpenSearch, helpers
import faker
import argparse
from typing import List, Dict, Any
import tqdm
import os
import time

# Initialize Faker
fake = faker.Faker()

# OpenSearch configuration
OPENSEARCH_HOST = "localhost"
OPENSEARCH_PORT = 9200
OPENSEARCH_INDEX = "prompt-keeper"

# OpenSearch client with optimized settings
opensearch_client = OpenSearch(
    hosts=[{'host': OPENSEARCH_HOST, 'port': OPENSEARCH_PORT}],
    http_compress=True,
    use_ssl=False,
    verify_certs=False,
    ssl_show_warn=False,
    timeout=30,
    max_retries=5,
    retry_on_timeout=True,
    # Limit request size
    http_auth=None,
    connection_class=None,
    pool_maxsize=10,
    # Add chunk size limit
    chunk_size=2000000  # 2MB chunk size
)

# Available models
MODELS = [
    "anthropic/claude-3-5-sonnet-latest",
    "anthropic/claude-3.5-haiku-latest",
    "chatgpt-4o-latest",
    "o1-preview",
    "o1-mini",
    "google_genai.gemini-exp-1206",
    "google_genai.gemini-2.0-flash-exp"
]

# Sample prompts and topics for variation
TOPICS = [
    "kubernetes", "docker", "python", "javascript", "typescript",
    "react", "vue", "angular", "node.js", "golang",
    "aws", "azure", "gcp", "terraform", "ansible",
    "ci/cd", "devops", "security", "monitoring", "databases"
]

PROMPT_TEMPLATES = [
    "How do I implement {topic} in my project?",
    "What are the best practices for {topic}?",
    "Can you explain {topic} concepts?",
    "Debug this {topic} issue: {issue}",
    "Write a {topic} script that {action}",
    "Compare {topic} with alternatives",
    "Optimize {topic} performance",
    "Set up {topic} in production",
    "Migrate from {old} to {topic}",
    "Create a {topic} configuration"
]

def generate_mock_response() -> str:
    """Generate a varied mock response"""
    response_types = [
        lambda: fake.text(max_nb_chars=2000),
        lambda: f"```{random.choice(['python', 'javascript', 'yaml', 'bash'])}\n{fake.text()}\n```",
        lambda: "Here's how you can solve this:\n\n" + "\n".join([f"{i}. {fake.sentence()}" for i in range(1, random.randint(3, 8))]),
        lambda: f"# {fake.word().title()}\n\n{fake.text()}\n\n## Steps\n\n" + "\n".join([f"- {fake.sentence()}" for _ in range(random.randint(3, 7))]),
        lambda: f"The best approach would be:\n\n```yaml\n{fake.text()}\n```\n\nMake sure to:\n" + "\n".join([f"- {fake.sentence()}" for _ in range(2, 5)])
    ]
    return random.choice(response_types)()

def generate_fake_document() -> Dict[str, Any]:
    """Generate a single fake document"""
    # Generate timestamp within last 6 months
    timestamp = datetime.now(UTC)
    # - timedelta(
    #     days=random.randint(0, 180),
    #     hours=random.randint(0, 23),
    #     minutes=random.randint(0, 59)
    # )

    # Generate messages
    topic = random.choice(TOPICS)
    prompt_template = random.choice(PROMPT_TEMPLATES)
    user_message = prompt_template.format(
        topic=topic,
        issue=fake.sentence(),
        action=fake.sentence(),
        old=random.choice(TOPICS)
    )

    messages = [
        {"role": "user", "content": user_message}
    ]

    # Sometimes add a system message
    if random.random() < 0.3:
        messages.insert(0, {
            "role": "system",
            "content": f"You are an expert in {topic} and related technologies."
        })

    # Generate response
    response_content = generate_mock_response()

    # Calculate fake token counts
    prompt_tokens = len(" ".join(msg["content"] for msg in messages).split())
    completion_tokens = len(response_content.split())
    total_tokens = prompt_tokens + completion_tokens

    # Create document
    return {
        "timestamp": timestamp.isoformat(),
        "model": random.choice(MODELS),
        "combined_text": f"{' '.join(msg['content'] for msg in messages)} {response_content}",
        "messages": messages,
        "response_data": {
            "choices": [{
                "message": {
                    "content": response_content,
                    "role": "assistant"
                }
            }]
        },
        "metadata": {
            "total_tokens": total_tokens,
            "response_ms": random.randint(500, 5000),
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "created": int(timestamp.timestamp())
        }
    }

def bulk_generator(num_documents: int):
    """Generator for bulk indexing"""
    for _ in range(num_documents):
        doc = generate_fake_document()
        yield {
            "_index": OPENSEARCH_INDEX,
            "_source": doc
        }

async def generate_fake_data(num_documents: int, batch_size: int = 200):  # Reduced default batch size
    """Generate and index fake data in batches"""
    total_batches = (num_documents + batch_size - 1) // batch_size

    with tqdm.tqdm(total=num_documents, desc="Generating documents") as pbar:
        for batch_num in range(total_batches):
            current_batch_size = min(batch_size, num_documents - batch_num * batch_size)

            try:
                # Generate batch
                batch_data = list(bulk_generator(current_batch_size))

                # Split into smaller chunks if needed (max 1MB per chunk)
                chunk_size = 100  # Even smaller chunks
                for i in range(0, len(batch_data), chunk_size):
                    chunk = batch_data[i:i + chunk_size]

                    # Add retry logic
                    max_retries = 3
                    retry_count = 0
                    while retry_count < max_retries:
                        try:
                            success, failed = helpers.bulk(
                                opensearch_client,
                                chunk,
                                raise_on_error=False,
                                request_timeout=30,
                                max_retries=3,
                                initial_backoff=2,
                                max_backoff=600,
                                raise_on_exception=False
                            )

                            pbar.update(len(chunk))
                            print(f"\rBatch {batch_num + 1}/{total_batches} - Chunk {i//chunk_size + 1}: {success} succeeded, {len(failed) if failed else 0} failed")

                            # Add small delay between chunks
                            await asyncio.sleep(0.1)
                            break

                        except Exception as e:
                            retry_count += 1
                            if retry_count == max_retries:
                                print(f"\nError in batch {batch_num + 1}, chunk {i//chunk_size + 1}: {str(e)}")
                                break
                            print(f"\nRetrying chunk {i//chunk_size + 1} (attempt {retry_count + 1})...")
                            await asyncio.sleep(2 ** retry_count)  # Exponential backoff

            except Exception as e:
                print(f"\nError processing batch {batch_num + 1}: {str(e)}")
                continue

def main():
    parser = argparse.ArgumentParser(description='Generate fake data for OpenSearch testing')
    parser.add_argument('--num-documents', type=int, default=1000000,
                      help='Number of documents to generate (default: 1,000,000)')
    parser.add_argument('--batch-size', type=int, default=200,
                      help='Batch size for bulk indexing (default: 200)')
    args = parser.parse_args()

    print(f"Generating {args.num_documents:,} fake documents...")

    try:
        # Configure OpenSearch index settings for bulk indexing
        index_settings = {
            "index": {
                "refresh_interval": "30s",  # Reduce refresh frequency during bulk indexing
                "number_of_replicas": 0     # Temporarily disable replicas
            }
        }
        opensearch_client.indices.put_settings(body=index_settings, index=OPENSEARCH_INDEX)

        asyncio.run(generate_fake_data(args.num_documents, args.batch_size))

        # Restore index settings after bulk indexing
        restore_settings = {
            "index": {
                "refresh_interval": "1s",    # Restore default refresh interval
                "number_of_replicas": 1      # Restore replica count
            }
        }
        opensearch_client.indices.put_settings(body=restore_settings, index=OPENSEARCH_INDEX)

        print("\nDone!")

    except Exception as e:
        print(f"\nError: {str(e)}")
        raise

if __name__ == "__main__":
    main()
