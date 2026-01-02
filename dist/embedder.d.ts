import { type EmbeddingModel } from "./config.js";
export interface EmbeddingResult {
    embedding: number[];
    model: string;
}
/**
 * Set the embedding model to use.
 */
export declare function setModel(modelName: string): EmbeddingModel;
/**
 * Get current model config.
 */
export declare function getModel(): EmbeddingModel;
/**
 * Get embedding from Ollama for a single text.
 */
export declare function getEmbedding(text: string): Promise<number[]>;
/**
 * Get embeddings for multiple texts in batch.
 * Ollama doesn't support true batching, so we process sequentially
 * but with error handling and progress tracking.
 */
export declare function getEmbeddings(texts: string[], onProgress?: (current: number, total: number) => void): Promise<number[][]>;
/**
 * Check if Ollama is running and model is available.
 */
export declare function checkOllama(): Promise<boolean>;
