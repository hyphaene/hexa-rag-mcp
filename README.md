# @hyphaene/hexa-rag-mcp

Semantic search MCP server for your codebase using PostgreSQL + pgvector + Ollama.

## Features

- **Semantic search** - Find relevant code and docs by meaning, not just keywords
- **Hybrid search** - Combine vector similarity with BM25 full-text search
- **RAG support** - Generate answers from your knowledge base using local LLMs
- **MCP server** - Integrate with Claude Code and other MCP clients
- **Multi-model** - Support for nomic, e5, and bge embeddings

## Prerequisites

- **PostgreSQL** with [pgvector](https://github.com/pgvector/pgvector) extension
- **Ollama** running locally with embedding models

### Quick setup

```bash
# PostgreSQL (macOS)
brew install postgresql@16
brew services start postgresql@16
createdb hexa_vectors
psql hexa_vectors -c "CREATE EXTENSION vector;"

# Ollama
brew install ollama
brew services start ollama
ollama pull bge-m3           # Embeddings (multilingual)
ollama pull qwen2.5:7b       # LLM for RAG
```

## Installation

```bash
npm install -g @hyphaene/hexa-rag-mcp
```

Or use npx:

```bash
npx @hyphaene/hexa-rag-mcp init
```

## Quick Start

```bash
# 1. Create global config (one-time setup)
hexa-rag-mcp init --global

# 2. Edit ~/.config/hexa-rag-mcp/config.json to add your sources

# 3. Check system requirements
hexa-rag-mcp doctor

# 4. Index your files
hexa-rag-mcp ingest

# 5. Search!
hexa-rag-mcp search "how does authentication work"

# 6. Or get a synthesized answer
hexa-rag-mcp search "what is the login flow" --rag
```

## Configuration

### Config file locations

hexa-rag-mcp looks for config in this order:

1. `--config <path>` - Explicit path (highest priority)
2. `./hexa-rag-mcp.config.json` - Project config (walks up directories)
3. `~/.config/hexa-rag-mcp/config.json` - Global config (fallback)

### Global config (recommended)

For personal use, create a global config once:

```bash
hexa-rag-mcp init --global           # Creates ~/.config/hexa-rag-mcp/config.json
hexa-rag-mcp init --global -i        # Interactive wizard
```

### Project config

For project-specific settings, create a local config:

```json
{
  "database": {
    "host": "localhost",
    "port": 5432,
    "database": "hexa_vectors",
    "user": "postgres"
  },
  "ollama": {
    "host": "http://localhost:11434"
  },
  "sources": [
    {
      "name": "docs",
      "type": "knowledge",
      "path": "./docs",
      "patterns": ["**/*.md"],
      "exclude": ["**/node_modules/**"]
    },
    {
      "name": "src",
      "type": "code",
      "path": "./src",
      "patterns": ["**/*.ts", "**/*.js"],
      "exclude": ["**/*.test.ts", "**/node_modules/**"]
    }
  ],
  "models": {
    "embedding": "bge",
    "reranker": "qllama/bge-reranker-v2-m3",
    "llm": "qwen"
  },
  "chunking": {
    "maxTokens": 500,
    "overlap": 50
  }
}
```

### Source types

| Type        | Description                   |
| ----------- | ----------------------------- |
| `knowledge` | Documentation, markdown files |
| `code`      | Source code                   |
| `script`    | Shell scripts, automation     |
| `plugin`    | Plugin/extension code         |
| `glossary`  | Term definitions              |
| `contract`  | API contracts, schemas        |
| `doc`       | General documentation         |

### Embedding models

| Model   | Dimensions | Multilingual | Best for                  |
| ------- | ---------- | ------------ | ------------------------- |
| `nomic` | 768        | No           | Fast, English content     |
| `e5`    | 1024       | Yes          | Multilingual docs         |
| `bge`   | 1024       | Yes          | Best quality, recommended |

## CLI Commands

### `hexa-rag-mcp init`

Create a new config file.

```bash
hexa-rag-mcp init                    # Project config (./hexa-rag-mcp.config.json)
hexa-rag-mcp init --global           # Global config (~/.config/hexa-rag-mcp/config.json)
hexa-rag-mcp init -g -i              # Global + interactive wizard
```

### `hexa-rag-mcp doctor`

Check system requirements (PostgreSQL, Ollama, models).

```bash
hexa-rag-mcp doctor
```

### `hexa-rag-mcp ingest`

Index files from configured sources.

```bash
hexa-rag-mcp ingest                  # All sources
hexa-rag-mcp ingest -s docs          # Specific source
```

### `hexa-rag-mcp search`

Search the knowledge base.

```bash
hexa-rag-mcp search "query"
hexa-rag-mcp search "query" --limit 20
hexa-rag-mcp search "query" --type code
hexa-rag-mcp search "query" --hybrid          # Vector + BM25
hexa-rag-mcp search "query" --rerank          # Cross-encoder reranking
hexa-rag-mcp search "query" --rag             # Generate answer
hexa-rag-mcp search "query" --rag --llm deepseek
```

### `hexa-rag-mcp serve`

Start MCP server for Claude Code integration.

```bash
hexa-rag-mcp serve
```

### `hexa-rag-mcp stats`

Show database statistics.

```bash
hexa-rag-mcp stats
```

## MCP Integration

Add to your Claude Code settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "hexa-rag": {
      "command": "npx",
      "args": [
        "-y",
        "-p",
        "@hyphaene/hexa-rag-mcp@latest",
        "-c",
        "hexa-rag-mcp-server"
      ]
    }
  }
}
```

Or if installed globally:

```json
{
  "mcpServers": {
    "hexa-rag": {
      "command": "hexa-rag-mcp-server"
    }
  }
}
```

### MCP Tools

| Tool     | Description                                |
| -------- | ------------------------------------------ |
| `search` | Semantic search with hybrid/rerank options |
| `rag`    | Search + generate synthesized answer       |
| `stats`  | Database statistics                        |

## Programmatic API

```typescript
import {
  loadConfig,
  getEmbedding,
  searchSimilar,
  generateAnswer,
} from "@hyphaene/hexa-rag-mcp";

// Load config
loadConfig("./hexa-rag-mcp.config.json");

// Search
const embedding = await getEmbedding("my query");
const results = await searchSimilar(embedding, 10);

// RAG
const answer = await generateAnswer({
  query: "How does auth work?",
  contexts: results.map((r) => ({
    content: r.content,
    source: r.source_path,
    type: r.source_type,
  })),
});
```

## Environment Variables

Override config via environment:

```bash
PGHOST=localhost
PGPORT=5432
PGDATABASE=hexa_vectors
PGUSER=postgres
PGPASSWORD=secret
OLLAMA_HOST=http://localhost:11434
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    VECTOR SEARCH                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Files ──► Chunker ──► Ollama ──► pgvector ──► Results          │
│  (md,ts)   (500 tok)   (embed)    (cosine)                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         RAG                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Question ──► Vector Search ──► Top chunks ──► LLM ──► Answer   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Resource Usage

| Resource      | Usage                       |
| ------------- | --------------------------- |
| RAM (idle)    | ~100MB (PostgreSQL)         |
| RAM (search)  | ~1.5GB (Ollama loads model) |
| RAM (RAG)     | ~5GB (LLM + embedding)      |
| Disk (DB)     | ~150MB per 10K chunks       |
| Disk (models) | ~4-8GB depending on models  |

## License

MIT
