/**
 * Configuration schema and loader for hexa-vector
 * Supports hexa-vector.config.json in cwd or specified via --config
 */
export interface SourceConfig {
    name: string;
    type: "knowledge" | "code" | "script" | "plugin" | "glossary" | "contract" | "doc";
    path: string;
    patterns: string[];
    exclude?: string[];
}
export interface DatabaseConfig {
    host: string;
    port: number;
    database: string;
    user: string;
    password?: string;
}
export interface OllamaConfig {
    host: string;
}
export interface ModelsConfig {
    embedding: "nomic" | "e5" | "bge";
    reranker: string;
    llm: "qwen" | "deepseek";
}
export interface ChunkingConfig {
    maxTokens: number;
    overlap: number;
}
export interface HexaVectorConfig {
    database: DatabaseConfig;
    ollama: OllamaConfig;
    sources: SourceConfig[];
    models: ModelsConfig;
    chunking: ChunkingConfig;
}
export declare const DEFAULT_CONFIG: Omit<HexaVectorConfig, "sources"> & {
    sources: SourceConfig[];
};
export interface EmbeddingModel {
    name: string;
    ollamaModel: string;
    dimensions: number;
    multilingual: boolean;
    maxTokens: number;
}
export declare const EMBEDDING_MODELS: Record<string, EmbeddingModel>;
export declare const LLM_MODELS: Record<string, string>;
/**
 * Expand ~ to home directory in paths
 */
export declare function expandPath(p: string): string;
/**
 * Get global config directory path
 */
export declare function getGlobalConfigDir(): string;
/**
 * Get global config file path
 */
export declare function getGlobalConfigPath(): string;
/**
 * Load and validate config file
 */
export declare function loadConfig(explicitPath?: string): HexaVectorConfig;
/**
 * Get current config (must call loadConfig first)
 */
export declare function getConfig(): HexaVectorConfig;
/**
 * Get config file path if loaded
 */
export declare function getConfigPath(): string | null;
/**
 * Reset loaded config (for testing)
 */
export declare function resetConfig(): void;
/**
 * Get embedding model config
 */
export declare function getEmbeddingModel(name?: string): EmbeddingModel;
/**
 * Get LLM model name for Ollama
 */
export declare function getLLMModel(name?: string): string;
/**
 * Get reranker model name
 */
export declare function getRerankerModel(): string;
export declare const CONFIG_TEMPLATE: HexaVectorConfig;
