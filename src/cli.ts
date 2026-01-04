#!/usr/bin/env node
/**
 * hexa-vector CLI
 * Semantic search for your codebase and documentation
 */

import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { createInterface } from "readline";
import {
  loadConfig,
  getConfig,
  getConfigPath,
  CONFIG_TEMPLATE,
  getEmbeddingModel,
  EMBEDDING_MODELS,
  LLM_MODELS,
  getRerankerModel,
  getGlobalConfigDir,
  getGlobalConfigPath,
} from "./config.js";
import { checkOllama, setModel, getModel } from "./embedder.js";
import { checkReranker } from "./reranker.js";
import { checkGenerator, getLLM } from "./generator.js";
import { getPool, closePool, getStats, ensureTable } from "./db.js";

const VERSION = "0.1.0";
const CONFIG_FILENAME = "hexa-vector.config.json";

// ============================================================================
// Helpers
// ============================================================================

function printHelp() {
  console.log(`
hexa-vector v${VERSION}
Semantic search for your codebase and documentation

Usage: hexa-vector <command> [options]

Commands:
  init [options]        Create a new config file
    --global, -g        Create global config (~/.config/hexa-vector/config.json)
    --interactive, -i   Interactive wizard mode
  doctor                Check system requirements
  ingest                Index files from configured sources
  search <query>        Search the knowledge base
  serve                 Start MCP server
  stats                 Show database statistics

Global Options:
  --config <path>       Path to config file
  --help, -h            Show this help
  --version, -v         Show version

Config Resolution:
  1. --config <path>    Explicit path (highest priority)
  2. ./hexa-vector.config.json (walks up directories)
  3. ~/.config/hexa-vector/config.json (global fallback)

Examples:
  hexa-vector init --global           # Create global config (recommended)
  hexa-vector init                    # Create project config
  hexa-vector init -g -i              # Global config with wizard
  hexa-vector doctor                  # Check PostgreSQL, Ollama, models
  hexa-vector ingest                  # Index all sources
  hexa-vector ingest -s docs          # Index specific source
  hexa-vector search "how to auth"    # Semantic search
  hexa-vector search "auth" --rag     # Search + generate answer
  hexa-vector serve                   # Start MCP server
`);
}

function printVersion() {
  console.log(`hexa-vector v${VERSION}`);
}

async function prompt(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ============================================================================
// Commands
// ============================================================================

async function cmdInit(interactive: boolean, global: boolean) {
  // Determine config path
  const targetPath = global
    ? getGlobalConfigPath()
    : join(process.cwd(), CONFIG_FILENAME);

  // Create directory if needed for global config
  if (global) {
    const configDir = getGlobalConfigDir();
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
  }

  if (existsSync(targetPath)) {
    console.log(`Config file already exists: ${targetPath}`);
    const answer = await prompt("Overwrite? [y/N] ");
    if (answer.toLowerCase() !== "y") {
      console.log("Aborted.");
      return;
    }
  }

  let config = { ...CONFIG_TEMPLATE };

  // For global config, use absolute paths with ~ prefix as examples
  if (global) {
    config.sources = [
      {
        name: "docs",
        type: "knowledge",
        path: "~/Documents/docs",
        patterns: ["**/*.md"],
        exclude: ["**/node_modules/**"],
      },
      {
        name: "projects",
        type: "code",
        path: "~/Code",
        patterns: ["**/*.ts", "**/*.js"],
        exclude: [
          "**/*.test.ts",
          "**/*.spec.ts",
          "**/node_modules/**",
          "**/dist/**",
        ],
      },
    ];
  }

  if (interactive) {
    console.log("\n🔧 hexa-vector Configuration Wizard\n");

    // Database
    console.log("📦 Database Configuration");
    const dbHost = await prompt(`  Host [${config.database.host}]: `);
    if (dbHost) config.database.host = dbHost;

    const dbPort = await prompt(`  Port [${config.database.port}]: `);
    if (dbPort) config.database.port = parseInt(dbPort, 10);

    const dbName = await prompt(`  Database [${config.database.database}]: `);
    if (dbName) config.database.database = dbName;

    const dbUser = await prompt(`  User [${config.database.user}]: `);
    if (dbUser) config.database.user = dbUser;

    // Ollama
    console.log("\n🦙 Ollama Configuration");
    const ollamaHost = await prompt(`  Host [${config.ollama.host}]: `);
    if (ollamaHost) config.ollama.host = ollamaHost;

    // Models
    console.log("\n🧠 Model Configuration");
    const embeddingModels = Object.keys(EMBEDDING_MODELS).join(", ");
    const embedding = await prompt(
      `  Embedding model (${embeddingModels}) [${config.models.embedding}]: `,
    );
    if (
      embedding &&
      (embedding === "nomic" || embedding === "e5" || embedding === "bge")
    ) {
      config.models.embedding = embedding;
    }

    const llmModels = Object.keys(LLM_MODELS).join(", ");
    const llm = await prompt(
      `  LLM for RAG (${llmModels}) [${config.models.llm}]: `,
    );
    if (llm && (llm === "qwen" || llm === "deepseek")) {
      config.models.llm = llm;
    }

    // Sources
    console.log("\n📁 Sources Configuration");
    console.log("  Enter sources to index (empty line to finish):");

    const sources: typeof config.sources = [];
    let sourceIndex = 1;

    while (true) {
      console.log(`\n  Source ${sourceIndex}:`);
      const name = await prompt("    Name (or empty to finish): ");
      if (!name) break;

      const path = await prompt("    Path: ");
      if (!path) {
        console.log("    Path is required, skipping source.");
        continue;
      }

      const typeOptions =
        "knowledge, code, script, plugin, glossary, contract, doc";
      const type = await prompt(`    Type (${typeOptions}) [code]: `);

      const patterns = await prompt(
        "    Patterns (comma-separated) [**/*.ts]: ",
      );
      const exclude = await prompt(
        "    Exclude (comma-separated) [**/node_modules/**]: ",
      );

      sources.push({
        name,
        path,
        type: (type || "code") as (typeof config.sources)[0]["type"],
        patterns: patterns
          ? patterns.split(",").map((p) => p.trim())
          : ["**/*.ts"],
        exclude: exclude
          ? exclude.split(",").map((p) => p.trim())
          : ["**/node_modules/**"],
      });

      sourceIndex++;
    }

    if (sources.length > 0) {
      config.sources = sources;
    }
  }

  // Write config
  writeFileSync(targetPath, JSON.stringify(config, null, 2) + "\n");
  console.log(`\n✅ Config written to ${targetPath}`);

  if (global) {
    console.log("\n📍 Global config created. This will be used as fallback");
    console.log("   when no project-level config is found.");
  }

  console.log("\nNext steps:");
  console.log("  1. Edit the config file to add your sources");
  console.log("  2. Run: hexa-vector doctor");
  console.log("  3. Run: hexa-vector ingest");
}

async function cmdDoctor() {
  console.log("🔍 Checking system requirements...\n");
  let allGood = true;

  // Load config
  try {
    loadConfig();
    const configFile = getConfigPath();
    if (configFile) {
      console.log(`✅ Config file: ${configFile}`);
    } else {
      console.log("⚠️  No config file found (using defaults)");
      console.log("   Run: hexa-vector init --global");
    }
  } catch (error) {
    console.log(
      `⚠️  No config file found (will use defaults). Run: hexa-vector init --global`,
    );
  }

  const config = getConfig();

  // Check PostgreSQL
  console.log("\n📦 PostgreSQL");
  try {
    const pool = await getPool();
    const result = await pool.query("SELECT version()");
    const version = result.rows[0].version.split(" ").slice(0, 2).join(" ");
    console.log(`  ✅ Connected: ${version}`);
    console.log(
      `     Database: ${config.database.database}@${config.database.host}:${config.database.port}`,
    );

    // Check pgvector extension
    const extResult = await pool.query(
      "SELECT extversion FROM pg_extension WHERE extname = 'vector'",
    );
    if (extResult.rows.length > 0) {
      console.log(`  ✅ pgvector extension: v${extResult.rows[0].extversion}`);
    } else {
      console.log("  ❌ pgvector extension not installed");
      console.log("     Run: CREATE EXTENSION vector;");
      allGood = false;
    }
  } catch (error) {
    console.log(
      `  ❌ Connection failed: ${error instanceof Error ? error.message : error}`,
    );
    console.log(`     Host: ${config.database.host}:${config.database.port}`);
    console.log(`     Database: ${config.database.database}`);
    allGood = false;
  }

  // Check Ollama
  console.log("\n🦙 Ollama");
  try {
    const response = await fetch(`${config.ollama.host}/api/tags`);
    if (response.ok) {
      console.log(`  ✅ Running at ${config.ollama.host}`);

      const data = (await response.json()) as {
        models: Array<{ name: string }>;
      };
      const availableModels = data.models?.map((m) => m.name) || [];

      // Check embedding model
      const embModel = getEmbeddingModel();
      const hasEmbedding = availableModels.some(
        (m) => m === embModel.ollamaModel || m.startsWith(embModel.ollamaModel),
      );
      if (hasEmbedding) {
        console.log(`  ✅ Embedding model: ${embModel.ollamaModel}`);
      } else {
        console.log(`  ❌ Embedding model not found: ${embModel.ollamaModel}`);
        console.log(`     Run: ollama pull ${embModel.ollamaModel}`);
        allGood = false;
      }

      // Check reranker
      const rerankerModel = getRerankerModel();
      const hasReranker = availableModels.some(
        (m) => m === rerankerModel || m.startsWith(rerankerModel),
      );
      if (hasReranker) {
        console.log(`  ✅ Reranker model: ${rerankerModel}`);
      } else {
        console.log(`  ⚠️  Reranker model not found: ${rerankerModel}`);
        console.log(`     Run: ollama pull ${rerankerModel}`);
      }

      // Check LLM
      const llmModel = getLLM();
      const hasLLM = availableModels.some(
        (m) => m === llmModel || m.startsWith(llmModel.split(":")[0]),
      );
      if (hasLLM) {
        console.log(`  ✅ LLM model: ${llmModel}`);
      } else {
        console.log(`  ⚠️  LLM model not found: ${llmModel}`);
        console.log(`     Run: ollama pull ${llmModel}`);
      }
    } else {
      console.log(`  ❌ Not responding at ${config.ollama.host}`);
      allGood = false;
    }
  } catch {
    console.log(`  ❌ Not running at ${config.ollama.host}`);
    console.log("     Run: brew services start ollama");
    allGood = false;
  }

  // Check sources
  console.log("\n📁 Sources");
  if (config.sources.length === 0) {
    console.log("  ⚠️  No sources configured");
    console.log("     Edit hexa-vector.config.json to add sources");
  } else {
    for (const source of config.sources) {
      if (existsSync(source.path)) {
        console.log(`  ✅ ${source.name}: ${source.path}`);
      } else {
        console.log(`  ❌ ${source.name}: ${source.path} (not found)`);
        allGood = false;
      }
    }
  }

  console.log();
  if (allGood) {
    console.log("✅ All checks passed! Ready to run: hexa-vector ingest");
  } else {
    console.log("❌ Some checks failed. Please fix the issues above.");
  }

  await closePool();
}

async function cmdIngest(sourceFilter?: string) {
  loadConfig();
  const config = getConfig();

  if (config.sources.length === 0) {
    console.error("No sources configured. Run: hexa-vector init");
    process.exit(1);
  }

  // Dynamic import to avoid loading heavy modules unless needed
  const { ingest } = await import("./ingest.js");

  // Filter sources if specified
  const sources = sourceFilter
    ? config.sources.filter((s) => s.name === sourceFilter)
    : config.sources;

  if (sources.length === 0) {
    console.error(`Source not found: ${sourceFilter}`);
    console.error(
      `Available sources: ${config.sources.map((s) => s.name).join(", ")}`,
    );
    process.exit(1);
  }

  // Run ingest with filtered sources
  process.argv = [
    process.argv[0],
    process.argv[1],
    ...sources.flatMap((s) => ["-s", s.name]),
  ];

  await import("./ingest.js");
}

async function cmdSearch(args: string[]) {
  loadConfig();

  // Build search args and delegate to search.ts
  process.argv = [process.argv[0], process.argv[1], ...args];
  await import("./search.js");
}

async function cmdServe() {
  loadConfig();
  console.log("Starting MCP server...");

  // Import and start MCP server
  await import("./mcp-server.js");
}

async function cmdStats() {
  loadConfig();

  try {
    const stats = await getStats();
    console.log("Database statistics:");
    console.log(`  Total chunks: ${stats.totalChunks}`);
    console.log(`  Total files: ${stats.totalFiles}`);
    console.log("\nBy type:");
    for (const [type, count] of Object.entries(stats.byType)) {
      console.log(`  ${type}: ${count}`);
    }
    console.log("\nBy source:");
    for (const [source, count] of Object.entries(stats.bySource)) {
      console.log(`  ${source}: ${count}`);
    }
  } catch (error) {
    console.error(
      "Failed to get stats:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  } finally {
    await closePool();
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  // Find --config option
  const configIdx = args.findIndex((a) => a === "--config");
  let configPath: string | undefined;
  if (configIdx !== -1 && args[configIdx + 1]) {
    configPath = args[configIdx + 1];
    args.splice(configIdx, 2);
  }

  // Load config if specified
  if (configPath) {
    loadConfig(configPath);
  }

  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "--version" || command === "-v") {
    printVersion();
    return;
  }

  switch (command) {
    case "init": {
      const interactive = args.includes("--interactive") || args.includes("-i");
      const global = args.includes("--global") || args.includes("-g");
      await cmdInit(interactive, global);
      break;
    }
    case "doctor":
      await cmdDoctor();
      break;
    case "ingest": {
      const sourceIdx = args.findIndex((a) => a === "-s" || a === "--source");
      const source = sourceIdx !== -1 ? args[sourceIdx + 1] : undefined;
      await cmdIngest(source);
      break;
    }
    case "search":
      await cmdSearch(args.slice(1));
      break;
    case "serve":
      await cmdServe();
      break;
    case "stats":
      await cmdStats();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((error) => {
  console.error("Error:", error.message || error);
  process.exit(1);
});
