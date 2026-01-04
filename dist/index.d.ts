/**
 * hexa-vector - Semantic search for your codebase and documentation
 *
 * Programmatic API for embedding and searching documents.
 */
export { type SourceConfig, type DatabaseConfig, type OllamaConfig, type ModelsConfig, type ChunkingConfig, type HexaVectorConfig, type EmbeddingModel, EMBEDDING_MODELS, LLM_MODELS, loadConfig, getConfig, getConfigPath, resetConfig, getEmbeddingModel, getLLMModel, getRerankerModel, expandPath, } from "./config-schema.js";
export { getEmbedding, getEmbeddings, checkOllama, setModel, getModel, } from "./embedder.js";
export { getPool, closePool, ensureTable, insertChunk, insertChunks, deleteChunksForFile, searchSimilar, searchHybrid, getSyncState, updateSyncState, getStats, setDbModel, type StoredChunk, } from "./db.js";
export { chunkFile, type Chunk } from "./chunker.js";
export { scanAllSources, type ScannedFile } from "./scanner.js";
export { rerank, checkReranker } from "./reranker.js";
export { generateAnswer, checkGenerator, setLLM, getLLM, type LLMModel, } from "./generator.js";
