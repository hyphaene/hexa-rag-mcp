/**
 * Configuration schema and loader for hexa-vector
 * Supports hexa-vector.config.json in cwd or specified via --config
 */

import { readFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { homedir } from "os";

// ============================================================================
// Types
// ============================================================================

export interface SourceConfig {
  name: string;
  type:
    | "knowledge"
    | "code"
    | "script"
    | "plugin"
    | "glossary"
    | "contract"
    | "doc";
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

// ============================================================================
// Defaults
// ============================================================================

export const DEFAULT_CONFIG: Omit<HexaVectorConfig, "sources"> & {
  sources: SourceConfig[];
} = {
  database: {
    host: process.env.PGHOST || "localhost",
    port: parseInt(process.env.PGPORT || "5432", 10),
    database: process.env.PGDATABASE || "hexa_vectors",
    user: process.env.PGUSER || process.env.USER || "postgres",
    password: process.env.PGPASSWORD,
  },
  ollama: {
    host: process.env.OLLAMA_HOST || "http://localhost:11434",
  },
  sources: [],
  models: {
    embedding: "bge",
    reranker: "qllama/bge-reranker-v2-m3",
    llm: "qwen",
  },
  chunking: {
    maxTokens: 500,
    overlap: 50,
  },
};

// ============================================================================
// Embedding models registry
// ============================================================================

export interface EmbeddingModel {
  name: string;
  ollamaModel: string;
  dimensions: number;
  multilingual: boolean;
  maxTokens: number;
}

export const EMBEDDING_MODELS: Record<string, EmbeddingModel> = {
  nomic: {
    name: "nomic",
    ollamaModel: "nomic-embed-text",
    dimensions: 768,
    multilingual: false,
    maxTokens: 500,
  },
  e5: {
    name: "e5",
    ollamaModel: "jeffh/intfloat-multilingual-e5-large:f16",
    dimensions: 1024,
    multilingual: true,
    maxTokens: 300,
  },
  bge: {
    name: "bge",
    ollamaModel: "bge-m3",
    dimensions: 1024,
    multilingual: true,
    maxTokens: 800,
  },
};

// ============================================================================
// LLM models registry
// ============================================================================

export const LLM_MODELS: Record<string, string> = {
  qwen: "qwen2.5:7b",
  deepseek: "deepseek-r1:8b",
};

// ============================================================================
// Config loader
// ============================================================================

const CONFIG_FILENAME = "hexa-vector.config.json";
const GLOBAL_CONFIG_DIR = ".config/hexa-vector";
const GLOBAL_CONFIG_FILENAME = "config.json";

let loadedConfig: HexaVectorConfig | null = null;
let configPath: string | null = null;

/**
 * Expand ~ to home directory in paths
 */
export function expandPath(p: string): string {
  if (p.startsWith("~/")) {
    return join(homedir(), p.slice(2));
  }
  if (p.startsWith("~")) {
    return join(homedir(), p.slice(1));
  }
  return p;
}

/**
 * Get global config directory path
 */
export function getGlobalConfigDir(): string {
  return join(homedir(), GLOBAL_CONFIG_DIR);
}

/**
 * Get global config file path
 */
export function getGlobalConfigPath(): string {
  return join(getGlobalConfigDir(), GLOBAL_CONFIG_FILENAME);
}

/**
 * Find config file by walking up from cwd, then checking global config
 */
function findConfigFile(startDir: string = process.cwd()): string | null {
  // First, look for project-level config by walking up
  let dir = resolve(startDir);
  const root = resolve("/");

  while (dir !== root) {
    const configFile = join(dir, CONFIG_FILENAME);
    if (existsSync(configFile)) {
      return configFile;
    }
    dir = resolve(dir, "..");
  }

  // Then, check global config
  const globalConfig = getGlobalConfigPath();
  if (existsSync(globalConfig)) {
    return globalConfig;
  }

  return null;
}

/**
 * Load and validate config file
 */
export function loadConfig(explicitPath?: string): HexaVectorConfig {
  if (loadedConfig && !explicitPath) {
    return loadedConfig;
  }

  const filePath = explicitPath || findConfigFile();

  if (!filePath || !existsSync(filePath)) {
    // Return defaults with empty sources (will fail on ingest but work for other commands)
    loadedConfig = { ...DEFAULT_CONFIG };
    return loadedConfig;
  }

  try {
    const raw = readFileSync(filePath, "utf-8");
    const userConfig = JSON.parse(raw) as Partial<HexaVectorConfig>;
    configPath = filePath;

    // Merge with defaults
    loadedConfig = {
      database: { ...DEFAULT_CONFIG.database, ...userConfig.database },
      ollama: { ...DEFAULT_CONFIG.ollama, ...userConfig.ollama },
      sources: (userConfig.sources || []).map((s) => ({
        ...s,
        path: expandPath(s.path),
        exclude: s.exclude || [],
      })),
      models: { ...DEFAULT_CONFIG.models, ...userConfig.models },
      chunking: { ...DEFAULT_CONFIG.chunking, ...userConfig.chunking },
    };

    return loadedConfig;
  } catch (error) {
    throw new Error(
      `Failed to load config from ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Get current config (must call loadConfig first)
 */
export function getConfig(): HexaVectorConfig {
  if (!loadedConfig) {
    return loadConfig();
  }
  return loadedConfig;
}

/**
 * Get config file path if loaded
 */
export function getConfigPath(): string | null {
  return configPath;
}

/**
 * Reset loaded config (for testing)
 */
export function resetConfig(): void {
  loadedConfig = null;
  configPath = null;
}

/**
 * Get embedding model config
 */
export function getEmbeddingModel(name?: string): EmbeddingModel {
  const config = getConfig();
  const modelName = name || config.models.embedding;
  if (EMBEDDING_MODELS[modelName]) {
    return EMBEDDING_MODELS[modelName];
  }
  return EMBEDDING_MODELS.bge;
}

/**
 * Get LLM model name for Ollama
 */
export function getLLMModel(name?: string): string {
  const config = getConfig();
  const llmName = name || config.models.llm;
  return LLM_MODELS[llmName] || LLM_MODELS.qwen;
}

/**
 * Get reranker model name
 */
export function getRerankerModel(): string {
  const config = getConfig();
  return config.models.reranker;
}

// ============================================================================
// Config template for init command
// ============================================================================

export const CONFIG_TEMPLATE: HexaVectorConfig = {
  database: {
    host: "localhost",
    port: 5432,
    database: "hexa_vectors",
    user: "postgres",
  },
  ollama: {
    host: "http://localhost:11434",
  },
  sources: [
    {
      name: "docs",
      type: "knowledge",
      path: "./docs",
      patterns: ["**/*.md"],
      exclude: ["**/node_modules/**"],
    },
    {
      name: "src",
      type: "code",
      path: "./src",
      patterns: ["**/*.ts", "**/*.js"],
      exclude: ["**/*.test.ts", "**/*.spec.ts", "**/node_modules/**"],
    },
  ],
  models: {
    embedding: "bge",
    reranker: "qllama/bge-reranker-v2-m3",
    llm: "qwen",
  },
  chunking: {
    maxTokens: 500,
    overlap: 50,
  },
};
