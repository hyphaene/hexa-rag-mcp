import type { ScannedFile } from "./scanner.js";
export interface Chunk {
    file: ScannedFile;
    index: number;
    content: string;
    tokenCount: number;
    /** Contextual prefix added before content for embedding */
    context?: string;
}
/**
 * Generate contextual prefix for a chunk based on file metadata.
 * This helps the embedding model understand what the chunk is about.
 */
export declare function generateChunkContext(file: ScannedFile, content: string): string;
/**
 * Chunk a file's content into segments of ~maxTokens.
 * Uses overlap to maintain context between chunks.
 * If file is provided, uses type-specific chunking strategies.
 */
export declare function chunkContent(content: string, maxTokens?: number, overlap?: number, file?: ScannedFile): string[];
/**
 * Read and chunk a file.
 * @param file - The file to chunk
 * @param maxTokens - Optional max tokens per chunk (defaults to CHUNK_CONFIG.maxTokens)
 */
export declare function chunkFile(file: ScannedFile, maxTokens?: number): Promise<Chunk[]>;
