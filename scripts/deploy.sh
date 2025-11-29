#!/bin/bash
set -e

# Ensure environment variables are set
if [ -z "$PROMPT_KEEPER_POSTGRES_USERNAME" ]; then
  echo "Error: PROMPT_KEEPER_POSTGRES_USERNAME is not set."
  exit 1
fi

if [ -z "$PROMPT_KEEPER_POSTGRES_PASSWORD" ]; then
  echo "Error: PROMPT_KEEPER_POSTGRES_PASSWORD is not set."
  exit 1
fi

if [ -z "$PROMPT_KEEPER_OPENSEARCH_USERNAME" ]; then
  echo "Error: PROMPT_KEEPER_OPENSEARCH_USERNAME is not set."
  exit 1
fi

if [ -z "$PROMPT_KEEPER_OPENSEARCH_PASSWORD" ]; then
  echo "Error: PROMPT_KEEPER_OPENSEARCH_PASSWORD is not set."
  exit 1
fi

# Construct Connection Strings
export POSTGRES_PRISMA_URL="postgresql://$PROMPT_KEEPER_POSTGRES_USERNAME:$PROMPT_KEEPER_POSTGRES_PASSWORD@localhost:5455/prompt_keeper?schema=public"
export POSTGRES_URL_NON_POOLING="postgresql://$PROMPT_KEEPER_POSTGRES_USERNAME:$PROMPT_KEEPER_POSTGRES_PASSWORD@localhost:5455/prompt_keeper?schema=public"
export OPENSEARCH_URL="http://localhost:9200"
export OPENSEARCH_USERNAME="$PROMPT_KEEPER_OPENSEARCH_USERNAME"
export OPENSEARCH_PASSWORD="$PROMPT_KEEPER_OPENSEARCH_PASSWORD"

echo "----------------------------------------"
echo "Starting Production Deployment"
echo "----------------------------------------"

echo "1. Running Prisma Migrations..."
npx prisma migrate deploy

echo "----------------------------------------"
echo "2. Running Data Migration (OpenSearch -> Postgres)..."
npx tsx scripts/migrate-opensearch-to-postgres.ts

echo "----------------------------------------"
echo "Deployment Completed Successfully!"
