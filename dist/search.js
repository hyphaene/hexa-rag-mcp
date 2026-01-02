#!/usr/bin/env node
import { getEmbedding, checkOllama, setModel, getModel } from "./embedder.js";
import { searchSimilar, searchHybrid, getStats, closePool, setDbModel, } from "./db.js";
import { EMBEDDING_MODELS } from "./config.js";
function formatPath(path) {
    // Shorten home directory
    const home = process.env.HOME || "";
    if (path.startsWith(home)) {
        return "~" + path.slice(home.length);
    }
    return path;
}
function formatPercentage(similarity) {
    return `${(similarity * 100).toFixed(1)}%`;
}
function highlightMatch(content, maxLength = 200) {
    // Get first lines of content
    const lines = content.split("\n").filter((l) => l.trim());
    let preview = lines.slice(0, 3).join(" ");
    if (preview.length > maxLength) {
        preview = preview.slice(0, maxLength) + "...";
    }
    return preview;
}
export async function search(options) {
    const { query, limit = 10, type, verbose = false, model, hybrid = false, alpha = 0.7, } = options;
    if (!query.trim()) {
        console.error("Please provide a search query");
        process.exit(1);
    }
    // Set model if specified
    if (model) {
        const modelConfig = setModel(model);
        setDbModel(modelConfig);
    }
    else {
        const modelConfig = getModel();
        setDbModel(modelConfig);
    }
    // Check Ollama
    if (!(await checkOllama())) {
        console.error("Ollama is not available. Please start it with: brew services start ollama");
        process.exit(1);
    }
    const currentModel = getModel();
    const searchMode = hybrid ? `hybrid (α=${alpha})` : "vector";
    console.log(`Searching for: "${query}"${type ? ` (type: ${type})` : ""} [model: ${currentModel.name}, mode: ${searchMode}]\n`);
    // Get embedding for query
    const startTime = Date.now();
    const embedding = await getEmbedding(query);
    const embedTime = Date.now() - startTime;
    // Search
    const searchStart = Date.now();
    const results = hybrid
        ? await searchHybrid(embedding, query, limit, alpha)
        : await searchSimilar(embedding, limit, type);
    const searchTime = Date.now() - searchStart;
    if (results.length === 0) {
        console.log("No results found.");
        return;
    }
    // Display results
    console.log(`Found ${results.length} results:\n`);
    for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const path = formatPath(r.source_path);
        if (hybrid && "hybrid_score" in r) {
            const hr = r;
            const score = (hr.hybrid_score * 1000).toFixed(1);
            const sim = formatPercentage(hr.similarity);
            console.log(`${i + 1}. [rrf:${score}] ${hr.source_name}/${hr.source_type} (vec:${sim}, bm25:#${hr.bm25_rank})`);
        }
        else {
            const sim = formatPercentage(r.similarity);
            console.log(`${i + 1}. [${sim}] ${r.source_name}/${r.source_type}`);
        }
        console.log(`   ${path}`);
        if (verbose) {
            console.log(`   Chunk ${r.chunk_index + 1}`);
            console.log(`   ${highlightMatch(r.content)}`);
        }
        else {
            // Just show first line
            const firstLine = r.content.split("\n").find((l) => l.trim()) || "";
            console.log(`   ${firstLine.slice(0, 80)}${firstLine.length > 80 ? "..." : ""}`);
        }
        console.log();
    }
    if (verbose) {
        console.log(`---`);
        console.log(`Embed time: ${embedTime}ms, Search time: ${searchTime}ms`);
    }
}
async function showStats() {
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
function parseArgs() {
    const args = process.argv.slice(2);
    const options = { query: "" };
    const queryParts = [];
    const modelNames = Object.keys(EMBEDDING_MODELS);
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "--limit" || arg === "-l") {
            options.limit = parseInt(args[++i]);
        }
        else if (arg === "--type" || arg === "-t") {
            options.type = args[++i];
        }
        else if (arg === "--verbose" || arg === "-v") {
            options.verbose = true;
        }
        else if (arg === "--model" || arg === "-m") {
            const modelName = args[++i];
            if (!modelNames.includes(modelName)) {
                console.error(`Unknown model: ${modelName}. Available: ${modelNames.join(", ")}`);
                process.exit(1);
            }
            options.model = modelName;
        }
        else if (arg === "--hybrid" || arg === "-H") {
            options.hybrid = true;
        }
        else if (arg === "--alpha" || arg === "-a") {
            options.alpha = parseFloat(args[++i]);
        }
        else if (arg === "--stats") {
            options.showStats = true;
        }
        else if (arg === "--help" || arg === "-h") {
            console.log(`
Usage: hexa-search [options] <query>

Search your knowledge base using semantic similarity.

Options:
  -l, --limit N     Number of results (default: 10)
  -t, --type TYPE   Filter by source type (knowledge, code, script, etc.)
  -m, --model NAME  Embedding model to use (${modelNames.join(", ")})
  -H, --hybrid      Use hybrid search (vector + BM25)
  -a, --alpha N     Vector weight for hybrid (0-1, default: 0.7)
  -v, --verbose     Show more details and content preview
  --stats           Show database statistics
  -h, --help        Show this help

Examples:
  hexa-search "comment fonctionne le chunking"
  hexa-search "SX status" --type code -m bge
  hexa-search "SEE-12345" --hybrid           # hybrid for exact matches
  hexa-search "glossaire" -H -a 0.5          # balanced hybrid
  hexa-search --stats
`);
            process.exit(0);
        }
        else if (!arg.startsWith("-")) {
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
    }
    else {
        await search(options);
    }
}
finally {
    await closePool();
}
