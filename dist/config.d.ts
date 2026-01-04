/**
 * Re-export config from new schema for backward compatibility
 * This file bridges old imports to the new config system
 */
export { type SourceConfig, type DatabaseConfig, type OllamaConfig, type ModelsConfig, type ChunkingConfig, type HexaVectorConfig, type EmbeddingModel, EMBEDDING_MODELS, LLM_MODELS, DEFAULT_CONFIG, CONFIG_TEMPLATE, loadConfig, getConfig, getConfigPath, resetConfig, getEmbeddingModel, getLLMModel, getRerankerModel, expandPath, getGlobalConfigDir, getGlobalConfigPath, } from "./config-schema.js";
import { type SourceConfig } from "./config-schema.js";
/**
 * @deprecated Use getConfig().database instead
 */
export declare function getDbConfig(): import("./config-schema.js").DatabaseConfig;
/**
 * @deprecated Use getConfig().ollama instead
 */
export declare function getOllamaConfig(): import("./config-schema.js").OllamaConfig;
/**
 * @deprecated Use getConfig().sources instead
 */
export declare function getSources(): SourceConfig[];
/**
 * @deprecated Use getConfig().chunking instead
 */
export declare function getChunkConfig(): import("./config-schema.js").ChunkingConfig;
export declare const DB_CONFIG: {
    readonly host: string;
    readonly port: number;
    readonly database: string;
    readonly user: string;
    readonly password: string | undefined;
};
export declare const OLLAMA_CONFIG: {
    readonly host: string;
    model: string;
    dimensions: number;
};
export declare const CHUNK_CONFIG: {
    readonly maxTokens: number;
    readonly overlap: number;
};
export declare const SOURCES: SourceConfig[];
