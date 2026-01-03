#!/usr/bin/env node
import { getEmbedding, checkOllama, setModel, getModel } from "./embedder.js";
import {
  searchSimilar,
  searchHybrid,
  getStats,
  closePool,
  setDbModel,
  ensureTable,
  type StoredChunk,
} from "./db.js";
import { rerank, checkReranker } from "./reranker.js";
import {
  generateAnswer,
  checkGenerator,
  setLLM,
  getLLM,
  LLM_MODELS,
  type LLMModel,
} from "./generator.js";
import { basename, dirname } from "path";
import { EMBEDDING_MODELS } from "./config.js";

interface SearchOptions {
  query: string;
  limit?: number;
  type?: string;
  verbose?: boolean;
  model?: string;
  hybrid?: boolean;
  alpha?: number;
  useRerank?: boolean;
  rag?: boolean;
  llm?: LLMModel;
}

function formatPath(path: string): string {
  // Shorten home directory
  const home = process.env.HOME || "";
  if (path.startsWith(home)) {
    return "~" + path.slice(home.length);
  }
  return path;
}

function formatPercentage(similarity: number): string {
  return `${(similarity * 100).toFixed(1)}%`;
}

function highlightMatch(content: string, maxLength: number = 200): string {
  // Get first lines of content
  const lines = content.split("\n").filter((l) => l.trim());
  let preview = lines.slice(0, 3).join(" ");

  if (preview.length > maxLength) {
    preview = preview.slice(0, maxLength) + "...";
  }

  return preview;
}

export async function search(options: SearchOptions): Promise<void> {
  const {
    query,
    limit = 10,
    type,
    verbose = false,
    model,
    hybrid = false,
    alpha = 0.7,
    useRerank = false,
    rag = false,
    llm,
  } = options;

  // Set LLM if specified
  if (llm) {
    setLLM(llm);
  }

  if (!query.trim()) {
    console.error("Please provide a search query");
    process.exit(1);
  }

  // Set model if specified
  if (model) {
    const modelConfig = setModel(model);
    setDbModel(modelConfig);
  } else {
    const modelConfig = getModel();
    setDbModel(modelConfig);
  }

  // Check Ollama
  if (!(await checkOllama())) {
    console.error(
      "Ollama is not available. Please start it with: brew services start ollama",
    );
    process.exit(1);
  }

  const currentModel = getModel();
  let searchMode = hybrid ? `hybrid (α=${alpha})` : "vector";
  if (useRerank) searchMode += " + rerank";
  console.log(
    `Searching for: "${query}"${type ? ` (type: ${type})` : ""} [model: ${currentModel.name}, mode: ${searchMode}]\n`,
  );

  // Check reranker if needed
  if (useRerank && !(await checkReranker())) {
    console.error(
      "Reranker model not available. Run: ollama pull qllama/bge-reranker-v2-m3",
    );
    process.exit(1);
  }

  // Get embedding for query
  const startTime = Date.now();
  const embedding = await getEmbedding(query);
  const embedTime = Date.now() - startTime;

  // Search - fetch more candidates if reranking
  const searchStart = Date.now();
  const fetchLimit = useRerank ? Math.max(limit * 3, 20) : limit;
  let results = hybrid
    ? await searchHybrid(embedding, query, fetchLimit, alpha)
    : await searchSimilar(embedding, fetchLimit, type);
  const searchTime = Date.now() - searchStart;

  if (results.length === 0) {
    console.log("No results found.");
    return;
  }

  // Rerank if requested
  let rerankTime = 0;
  if (useRerank) {
    const rerankStart = Date.now();
    console.log(`Reranking ${results.length} candidates...`);
    const reranked = await rerank(query, results, (r) => r.content, limit);
    results = reranked;
    rerankTime = Date.now() - rerankStart;
  }

  // Display results
  console.log(`Found ${results.length} results:\n`);

  for (let i = 0; i < Math.min(results.length, limit); i++) {
    const r = results[i];
    const path = formatPath(r.source_path);

    if (useRerank && "rerankScore" in r) {
      const rr = r as typeof r & { rerankScore: number };
      const sim = formatPercentage(rr.similarity);
      console.log(
        `${i + 1}. [rerank:${rr.rerankScore.toFixed(2)}] ${rr.source_name}/${rr.source_type} (vec:${sim})`,
      );
    } else if (hybrid && "hybrid_score" in r) {
      const hr = r as typeof r & { hybrid_score: number; bm25_rank: number };
      const score = (hr.hybrid_score * 1000).toFixed(1);
      const sim = formatPercentage(hr.similarity);
      console.log(
        `${i + 1}. [rrf:${score}] ${hr.source_name}/${hr.source_type} (vec:${sim}, bm25:#${hr.bm25_rank})`,
      );
    } else {
      const sim = formatPercentage(r.similarity);
      console.log(`${i + 1}. [${sim}] ${r.source_name}/${r.source_type}`);
    }
    console.log(`   ${path}`);

    if (verbose) {
      console.log(`   Chunk ${r.chunk_index + 1}`);
      console.log(`   ${highlightMatch(r.content)}`);
    } else {
      // Just show first line
      const firstLine = r.content.split("\n").find((l) => l.trim()) || "";
      console.log(
        `   ${firstLine.slice(0, 80)}${firstLine.length > 80 ? "..." : ""}`,
      );
    }
    console.log();
  }

  if (verbose) {
    console.log(`---`);
    console.log(`Embed time: ${embedTime}ms, Search time: ${searchTime}ms`);
  }

  // RAG mode: generate answer from retrieved contexts
  if (rag) {
    if (!(await checkGenerator())) {
      console.error("Generator model not available. Run: ollama pull mistral");
      process.exit(1);
    }

    console.log("---\n");
    console.log(`Generating answer with ${getLLM()}...\n`);

    const contexts = results.slice(0, 5).map((r) => ({
      content: r.content,
      source: formatPath(r.source_path),
      type: r.source_type,
    }));

    const genStart = Date.now();
    const answer = await generateAnswer({ query, contexts });
    const genTime = Date.now() - genStart;

    console.log("## Answer\n");
    console.log(answer);
    console.log();

    // Display sources
    console.log("## Sources\n");
    contexts.forEach((c, i) => {
      console.log(`[${i + 1}] ${c.source} (${c.type})`);
    });
    console.log();

    // Display timing
    const totalTime = Date.now() - startTime;
    console.log("## Timing\n");
    console.log(`- Embedding: ${embedTime}ms`);
    console.log(`- Search: ${searchTime}ms`);
    if (rerankTime > 0) console.log(`- Rerank: ${rerankTime}ms`);
    console.log(`- Generation: ${genTime}ms`);
    console.log(`- Total: ${totalTime}ms`);
    console.log();
  }
}

async function showStats(): Promise<void> {
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
}

// CLI
function parseArgs(): SearchOptions & { showStats?: boolean } {
  const args = process.argv.slice(2);
  const options: SearchOptions & { showStats?: boolean } = { query: "" };
  const queryParts: string[] = [];
  const modelNames = Object.keys(EMBEDDING_MODELS);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--limit" || arg === "-l") {
      options.limit = parseInt(args[++i]);
    } else if (arg === "--type" || arg === "-t") {
      options.type = args[++i];
    } else if (arg === "--verbose" || arg === "-v") {
      options.verbose = true;
    } else if (arg === "--model" || arg === "-m") {
      const modelName = args[++i];
      if (!modelNames.includes(modelName)) {
        console.error(
          `Unknown model: ${modelName}. Available: ${modelNames.join(", ")}`,
        );
        process.exit(1);
      }
      options.model = modelName;
    } else if (arg === "--hybrid" || arg === "-H") {
      options.hybrid = true;
    } else if (arg === "--alpha" || arg === "-a") {
      options.alpha = parseFloat(args[++i]);
    } else if (arg === "--rerank" || arg === "-R") {
      options.useRerank = true;
    } else if (arg === "--rag") {
      options.rag = true;
    } else if (arg === "--llm") {
      const llmName = args[++i] as LLMModel;
      const llmNames = Object.keys(LLM_MODELS);
      if (!llmNames.includes(llmName)) {
        console.error(
          `Unknown LLM: ${llmName}. Available: ${llmNames.join(", ")}`,
        );
        process.exit(1);
      }
      options.llm = llmName;
    } else if (arg === "--stats") {
      options.showStats = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Usage: hexa-search [options] <query>

Search your knowledge base using semantic similarity.

Options:
  -l, --limit N     Number of results (default: 10)
  -t, --type TYPE   Filter by source type (knowledge, code, script, etc.)
  -m, --model NAME  Embedding model to use (${modelNames.join(", ")})
  -H, --hybrid      Use hybrid search (vector + BM25)
  -a, --alpha N     Vector weight for hybrid (0-1, default: 0.7)
  -R, --rerank      Rerank results with cross-encoder (slower, more accurate)
  --rag             Generate a synthesized answer from retrieved contexts
  --llm NAME        LLM for RAG generation (${Object.keys(LLM_MODELS).join(", ")})
  -v, --verbose     Show more details and content preview
  --stats           Show database statistics
  -h, --help        Show this help

Examples:
  hexa-search "comment fonctionne le chunking"
  hexa-search "SX status" --type code -m bge
  hexa-search "SEE-12345" --hybrid           # hybrid for exact matches
  hexa-search "c'est quoi un SX" --rag       # get a synthesized answer
  hexa-search --stats
`);
      process.exit(0);
    } else if (!arg.startsWith("-")) {
      queryParts.push(arg);
    }
  }

  options.query = queryParts.join(" ");
  return options;
}

// Main
const options = parseArgs();
try {
  if (options.showStats) {
    await showStats();
  } else {
    await search(options);
  }
} finally {
  await closePool();
}
