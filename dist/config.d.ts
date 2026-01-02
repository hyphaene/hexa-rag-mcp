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
export declare const OLLAMA_CONFIG: {
    host: string;
    model: string;
    dimensions: number;
};
export declare const CHUNK_CONFIG: {
    maxTokens: number;
    overlap: number;
};
