-- Run on a PostgreSQL server with pgvector installed.
-- psql $POSTGRES_URL -f scripts/init-pgvector.sql
--
-- PGVectorStore.initialize() creates tables on first use.
-- This script ensures the pgvector extension is enabled.

CREATE EXTENSION IF NOT EXISTS vector;

-- Tables created automatically by LangChain on first use:
-- - recipe_embeddings (semantic cache for generated recipes)
-- - recipe_index (similar recipes - synced from database)
-- - enrichment_cache (classify, summary, macro, pairing cache)
-- - conversation_memory (Pro users - chat history for recall)
-- - balkan_recipe_corpus (RAG corpus - run npm run ingest:corpus to populate)
