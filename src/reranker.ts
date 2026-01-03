import { OLLAMA_CONFIG } from "./config.js";

const RERANKER_MODEL = "qllama/bge-reranker-v2-m3";

interface RerankResult {
  index: number;
  score: number;
}

/**
 * Get reranking score for a query-document pair.
 * BGE reranker uses embeddings endpoint with special input format.
 */
async function getRerankScore(
  query: string,
  document: string,
): Promise<number> {
  // BGE reranker expects query and passage concatenated with special tokens
  const input = `query: ${query} passage: ${document}`;

  const response = await fetch(`${OLLAMA_CONFIG.host}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: RERANKER_MODEL,
      prompt: input,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Reranker error: ${response.status} ${await response.text()}`,
    );
  }

  const result = (await response.json()) as { embedding: number[] };

  // BGE reranker returns a single value as the relevance score
  // The first element of the embedding is the score
  return result.embedding[0] ?? 0;
}

/**
 * Rerank a list of documents based on relevance to query.
 * Returns indices sorted by relevance score (highest first).
 */
export async function rerank<T>(
  query: string,
  documents: T[],
  getContent: (doc: T) => string,
  topK?: number,
): Promise<Array<T & { rerankScore: number }>> {
  // Score all documents
  const scores: RerankResult[] = [];

  for (let i = 0; i < documents.length; i++) {
    const content = getContent(documents[i]);
    // Truncate content to avoid context overflow (reranker has 8K context)
    const truncated = content.slice(0, 2000);
    const score = await getRerankScore(query, truncated);
    scores.push({ index: i, score });
  }

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  // Return top K documents with scores
  const limit = topK ?? documents.length;
  return scores.slice(0, limit).map((s) => ({
    ...documents[s.index],
    rerankScore: s.score,
  }));
}

/**
 * Check if reranker model is available.
 */
export async function checkReranker(): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA_CONFIG.host}/api/tags`);
    if (!response.ok) return false;

    const data = (await response.json()) as { models: Array<{ name: string }> };
    return (
      data.models?.some(
        (m) => m.name === RERANKER_MODEL || m.name.startsWith(RERANKER_MODEL),
      ) ?? false
    );
  } catch {
    return false;
  }
}
