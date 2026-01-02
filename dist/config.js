import { homedir } from "os";
import { join } from "path";
const HOME = homedir();
export const SOURCES = [
    // Groupe 1: Hexactitude
    {
        name: "hexactitude-docs",
        type: "knowledge",
        basePath: join(HOME, "Hexactitude"),
        patterns: ["**/*.md"],
        exclude: [
            "**/gitignored/**",
            "**/node_modules/**",
            "**/cache/**",
            "**/.git/**",
        ],
    },
    {
        name: "hexactitude-scripts",
        type: "script",
        basePath: join(HOME, "Hexactitude/claude/scripts"),
        patterns: ["**/*.sh"],
        exclude: [],
    },
    {
        name: "hexactitude-plugins",
        type: "plugin",
        basePath: join(HOME, "Hexactitude/claude/marketplace/plugins"),
        patterns: ["**/*.md", "**/*.ts", "**/manifest.json"],
        exclude: ["**/node_modules/**"],
    },
    // Groupe 2: Documentation métier
    {
        name: "ahs-documentation",
        type: "glossary",
        basePath: join(HOME, "Adeo/ahs-documentation"),
        patterns: ["**/*.md"],
        exclude: ["**/node_modules/**"],
    },
    // Groupe 3: Code source
    {
        name: "front",
        type: "code",
        basePath: join(HOME, "Adeo/projects/execution/ahs-operator-execution-frontend/src"),
        patterns: ["**/*.ts", "**/*.vue"],
        exclude: ["**/*.spec.ts", "**/*.test.ts", "**/node_modules/**"],
    },
    {
        name: "bff",
        type: "code",
        basePath: join(HOME, "Adeo/projects/execution/ahs-operator-execution-bff/src"),
        patterns: ["**/*.ts"],
        exclude: ["**/*.spec.ts", "**/*.test.ts", "**/node_modules/**"],
    },
    {
        name: "contracts",
        type: "contract",
        basePath: join(HOME, "Adeo/projects/execution/_packages/ahs-operator-execution-contracts/src"),
        patterns: ["**/*.ts"],
        exclude: ["**/node_modules/**"],
    },
];
export const DB_CONFIG = {
    host: "localhost",
    port: 5432,
    database: "hexa_vectors",
    user: process.env.USER || "maximilien",
};
export const EMBEDDING_MODELS = {
    nomic: {
        name: "nomic",
        ollamaModel: "nomic-embed-text",
        dimensions: 768,
        multilingual: false,
    },
    e5: {
        name: "e5",
        ollamaModel: "jeffh/intfloat-multilingual-e5-large:f16",
        dimensions: 1024,
        multilingual: true,
    },
};
export const OLLAMA_CONFIG = {
    host: "http://localhost:11434",
    // Default model - can be overridden via CLI
    model: "nomic-embed-text",
    dimensions: 768,
};
/**
 * Get embedding model config by name, defaults to nomic
 */
export function getEmbeddingModel(name) {
    if (name && EMBEDDING_MODELS[name]) {
        return EMBEDDING_MODELS[name];
    }
    return EMBEDDING_MODELS.nomic;
}
export const CHUNK_CONFIG = {
    maxTokens: 500,
    overlap: 50, // tokens de chevauchement entre chunks
};
