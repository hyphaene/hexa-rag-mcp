import pg from "pg";
import type { Chunk } from "./chunker.js";
export declare function getPool(): Promise<pg.Pool>;
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
