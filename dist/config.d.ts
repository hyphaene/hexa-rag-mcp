export interface SourceConfig {
    name: string;
    type: "knowledge" | "script" | "plugin" | "glossary" | "code" | "contract" | "doc";
    basePath: string;
    patterns: string[];
    exclude: string[];
}
export declare const SOURCES: SourceConfig[];
export declare const DB_CONFIG: {
    host: string;
    port: number;
    database: string;
    user: string;
};
export interface EmbeddingModel {
    name: string;
    ollamaModel: string;
    dimensions: number;
    multilingual: boolean;
}
export declare const EMBEDDING_MODELS: Record<string, EmbeddingModel>;
export declare const OLLAMA_CONFIG: {
    host: string;
    model: string;
    dimensions: number;
};
/**
 * Get embedding model config by name, defaults to nomic
 */
export declare function getEmbeddingModel(name?: string): EmbeddingModel;
export declare const CHUNK_CONFIG: {
    maxTokens: number;
    overlap: number;
};
