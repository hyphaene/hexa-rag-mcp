/**
 * Re-export config from new schema for backward compatibility
 * This file bridges old imports to the new config system
 */

export {
  type SourceConfig,
  type DatabaseConfig,
  type OllamaConfig,
  type ModelsConfig,
  type ChunkingConfig,
  type HexaVectorConfig,
  type EmbeddingModel,
  EMBEDDING_MODELS,
  LLM_MODELS,
  DEFAULT_CONFIG,
  CONFIG_TEMPLATE,
  loadConfig,
  getConfig,
  getConfigPath,
  resetConfig,
  getEmbeddingModel,
  getLLMModel,
  getRerankerModel,
  expandPath,
  getGlobalConfigDir,
  getGlobalConfigPath,
} from "./config-schema.js";

// Legacy exports for backward compatibility
import { getConfig, type SourceConfig } from "./config-schema.js";

/**
 * @deprecated Use getConfig().database instead
 */
export function getDbConfig() {
  return getConfig().database;
}

/**
 * @deprecated Use getConfig().ollama instead
 */
export function getOllamaConfig() {
  return getConfig().ollama;
}

/**
 * @deprecated Use getConfig().sources instead
 */
export function getSources(): SourceConfig[] {
  return getConfig().sources;
}

/**
 * @deprecated Use getConfig().chunking instead
 */
export function getChunkConfig() {
  return getConfig().chunking;
}

// Legacy constants (now dynamic from config)
export const DB_CONFIG = {
  get host() {
    return getConfig().database.host;
  },
  get port() {
    return getConfig().database.port;
  },
  get database() {
    return getConfig().database.database;
  },
  get user() {
    return getConfig().database.user;
  },
  get password() {
    return getConfig().database.password;
  },
};

export const OLLAMA_CONFIG = {
  get host() {
    return getConfig().ollama.host;
  },
  model: "nomic-embed-text", // legacy default
  dimensions: 768,
};

export const CHUNK_CONFIG = {
  get maxTokens() {
    return getConfig().chunking.maxTokens;
  },
  get overlap() {
    return getConfig().chunking.overlap;
  },
};

export const SOURCES = new Proxy([] as SourceConfig[], {
  get(target, prop) {
    const sources = getConfig().sources;
    if (prop === "length") return sources.length;
    if (typeof prop === "string" && !isNaN(Number(prop))) {
      return sources[Number(prop)];
    }
    if (prop === Symbol.iterator) {
      return sources[Symbol.iterator].bind(sources);
    }
    return Reflect.get(sources, prop);
  },
});
