import { getConfig, type EmbeddingModel, getEmbeddingModel } from "./config.js";

export interface EmbeddingResult {
  embedding: number[];
  model: string;
}

// Current model used for embeddings - can be set via setModel()
let currentModel: EmbeddingModel = getEmbeddingModel();

/**
 * Set the embedding model to use.
 */
export function setModel(modelName: string): EmbeddingModel {
  currentModel = getEmbeddingModel(modelName);
  return currentModel;
}

/**
 * Get current model config.
 */
export function getModel(): EmbeddingModel {
  return currentModel;
}

/**
 * Get embedding from Ollama for a single text.
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const config = getConfig();
  const response = await fetch(`${config.ollama.host}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: currentModel.ollamaModel,
      prompt: text,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Ollama error: ${response.status} ${await response.text()}`,
    );
  }

  const result = (await response.json()) as { embedding: number[] };
  return result.embedding;
}

/**
 * Get embeddings for multiple texts in batch.
 * Ollama doesn't support true batching, so we process sequentially
 * but with error handling and progress tracking.
 */
export async function getEmbeddings(
  texts: string[],
  onProgress?: (current: number, total: number) => void,
): Promise<number[][]> {
  const embeddings: number[][] = [];

  for (let i = 0; i < texts.length; i++) {
    try {
      const embedding = await getEmbedding(texts[i]);
      embeddings.push(embedding);
      onProgress?.(i + 1, texts.length);
    } catch (error) {
      console.error(`Error getting embedding for text ${i}:`, error);
      // Return zero vector on error to maintain alignment
      embeddings.push(new Array(currentModel.dimensions).fill(0));
    }
  }

  return embeddings;
}

/**
 * Check if Ollama is running and model is available.
 */
export async function checkOllama(): Promise<boolean> {
  try {
    const config = getConfig();
    const response = await fetch(`${config.ollama.host}/api/tags`);
    if (!response.ok) return false;

    const data = (await response.json()) as {
      models: Array<{ name: string }>;
    };
    const modelToCheck = currentModel.ollamaModel;
    const hasModel = data.models?.some(
      (m) => m.name === modelToCheck || m.name.startsWith(modelToCheck),
    );

    if (!hasModel) {
      console.error(
        `Model ${modelToCheck} not found. Available:`,
        data.models?.map((m) => m.name),
      );
    }

    return hasModel;
  } catch {
    console.error("Ollama is not running");
    return false;
  }
}

// CLI pour tester
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("Checking Ollama...");
  const ok = await checkOllama();
  if (!ok) {
    process.exit(1);
  }

  console.log("Getting test embedding...");
  const start = Date.now();
  const embedding = await getEmbedding("Hello, this is a test sentence.");
  const elapsed = Date.now() - start;

  console.log(`Embedding dimensions: ${embedding.length}`);
  console.log(`Time: ${elapsed}ms`);
  console.log(`First 5 values: ${embedding.slice(0, 5).join(", ")}`);
}
