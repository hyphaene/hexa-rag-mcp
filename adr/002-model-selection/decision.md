# ADR-002: Model Selection for RAG Pipeline

## Status

Accepted

## Context

We need to select models for two components of our local RAG system:

1. **Embedding model** - for vectorizing chunks and queries
2. **Generation model (LLM)** - for synthesizing answers from retrieved contexts

Constraints:

- Local execution via Ollama
- 24 GB RAM available
- Multilingual support required (French questions on English content)
- Minimal hallucinations

## Embedding Models Evaluated

| Model                 | Dimensions | Context | Multilingual | RAM     | Errors on Ingest        |
| --------------------- | ---------- | ------- | ------------ | ------- | ----------------------- |
| nomic-embed-text      | 768        | 8192    | No           | ~500 MB | 1                       |
| multilingual-e5-large | 1024       | 512     | Yes          | ~1.2 GB | ~472 (context overflow) |
| **bge-m3**            | 1024       | 8192    | Yes          | ~1.2 GB | **0**                   |

### Decision: bge-m3

**bge-m3** combines the best of both worlds:

- 8192 token context (like nomic) - no context overflow errors
- Multilingual support (like e5) - FR→EN queries work
- Competitive performance on benchmarks

## LLM Models Evaluated

Tested on: `"c'est quoi un SX"` with 5 retrieved contexts

| Model          | Size   | Hallucinations                | Speed | Quality       |
| -------------- | ------ | ----------------------------- | ----- | ------------- |
| mistral 7B     | 4.4 GB | Yes (invented "SPOM" acronym) | 7s    | Poor          |
| **qwen2.5 7B** | 4.7 GB | None                          | 11s   | **Excellent** |
| deepseek-r1 8B | 5.2 GB | None                          | 17s   | Good          |

### Decision: qwen2.5:7b (default)

**qwen2.5:7b** selected as default because:

- Zero hallucinations on test queries
- Native multilingual support (Chinese model, excellent FR/EN)
- Good instruction following
- Reasonable speed (11s generation)

**deepseek-r1:8b** kept as alternative for reasoning-heavy queries.

**mistral** removed - too prone to hallucinations for our RAG use case.

## Configuration

### Embedding

- Model: `bge-m3`
- Max tokens per chunk: 800 (generous margin for 8K context)

### Generation

- Default: `qwen2.5:7b`
- Alternative: `deepseek-r1:8b`
- Temperature: 0.1 (low for factual responses)
- Max tokens: 1000

## Prompt Engineering

Key prompt elements to reduce hallucinations:

```
- "Utilise uniquement les sources fournies"
- "Si les sources ne contiennent pas l'information, dis-le clairement"
- "Utilise des références [1], [2], etc."
```

## Disk Usage

```
~/.ollama/models/
├── bge-m3              ~1.2 GB (embedding)
├── qwen2.5:7b          ~4.7 GB (generation - default)
├── deepseek-r1:8b      ~5.2 GB (generation - alternative)
└── nomic-embed-text    ~274 MB (legacy, kept for comparison)
Total: ~11 GB
```

## Future Considerations

1. **Reranker**: Tested `bge-reranker-v2-m3` but Ollama doesn't support true cross-encoder reranking (returns embeddings instead of scores). Could implement via Python/HuggingFace.

2. **Larger models**: If RAM allows, `qwen2.5:14b` or `llama3:8b` could improve quality.

3. **Specialized models**: For code-heavy queries, `deepseek-coder` or `qwen2.5-coder` might be better.
