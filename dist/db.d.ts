import pg from "pg";
import { type EmbeddingModel } from "./config.js";
import type { Chunk } from "./chunker.js";
/**
 * Set the model (determines which table to use).
 */
export declare function setDbModel(model: EmbeddingModel): void;
export declare function getPool(): Promise<pg.Pool>;
/**
 * Ensure table exists for current model.
 */
export declare function ensureTable(): Promise<void>;
export declare function closePool(): Promise<void>;
export interface StoredChunk {
    id: number;
    source_path: string;
    source_name: string;
    source_type: string;
    chunk_index: number;
    content: string;
    created_at: Date;
}
/**
 * Insert a chunk with its embedding.
 * Also generates tsvector for full-text search.
 */
export declare function insertChunk(chunk: Chunk, embedding: number[]): Promise<void>;
/**
 * Insert multiple chunks at once (more efficient).
 */
export declare function insertChunks(chunks: Array<{
    chunk: Chunk;
    embedding: number[];
}>): Promise<void>;
/**
 * Delete all chunks for a file (before re-indexing).
 */
export declare function deleteChunksForFile(filePath: string): Promise<void>;
/**
 * Search for similar chunks.
 */
export declare function searchSimilar(embedding: number[], limit?: number, sourceType?: string): Promise<Array<StoredChunk & {
    similarity: number;
}>>;
/**
 * Hybrid search combining vector similarity and BM25 full-text search.
 * Uses Reciprocal Rank Fusion (RRF) to combine scores.
 * @param embedding - Query embedding vector
 * @param query - Original query text for BM25
 * @param limit - Number of results to return
 * @param alpha - Weight for vector search (0-1), BM25 weight = 1-alpha
 */
export declare function searchHybrid(embedding: number[], query: string, limit?: number, alpha?: number): Promise<Array<StoredChunk & {
    similarity: number;
    bm25_rank: number;
    hybrid_score: number;
}>>;
/**
 * Get sync state for a file.
 */
export declare function getSyncState(filePath: string): Promise<{
    last_mtime: Date;
    file_hash: string;
} | null>;
/**
 * Update sync state for a file.
 */
export declare function updateSyncState(filePath: string, mtime: Date, hash: string): Promise<void>;
/**
 * Get stats about indexed content.
 */
export declare function getStats(): Promise<{
    totalChunks: number;
    totalFiles: number;
    byType: Record<string, number>;
    bySource: Record<string, number>;
}>;
