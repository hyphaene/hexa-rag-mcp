#!/usr/bin/env node
import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { scanAllSources, type ScannedFile } from "./scanner.js";
import { chunkFile, type Chunk } from "./chunker.js";
import { getEmbedding, checkOllama } from "./embedder.js";
import {
  insertChunk,
  deleteChunksForFile,
  getSyncState,
  updateSyncState,
  getStats,
  closePool,
} from "./db.js";

interface IngestOptions {
  sources?: string[];
  incremental?: boolean;
  limit?: number;
  verbose?: boolean;
}

async function computeFileHash(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return createHash("md5").update(content).digest("hex");
}

async function shouldProcessFile(
  file: ScannedFile,
  incremental: boolean,
): Promise<boolean> {
  if (!incremental) return true;

  const syncState = await getSyncState(file.absolutePath);
  if (!syncState) return true;

  // Check if file was modified
  const hash = await computeFileHash(file.absolutePath);
  return hash !== syncState.file_hash;
}

async function processFile(
  file: ScannedFile,
  verbose: boolean,
): Promise<number> {
  try {
    // Chunk the file
    const chunks = await chunkFile(file);
    if (chunks.length === 0) {
      if (verbose) console.log(`  Skipping empty file: ${file.relativePath}`);
      return 0;
    }

    // Delete existing chunks for this file
    await deleteChunksForFile(file.absolutePath);

    // Process each chunk
    for (const chunk of chunks) {
      const embedding = await getEmbedding(chunk.content);
      await insertChunk(chunk, embedding);
    }

    // Update sync state
    const hash = await computeFileHash(file.absolutePath);
    await updateSyncState(file.absolutePath, file.mtime, hash);

    return chunks.length;
  } catch (error) {
    console.error(`Error processing ${file.absolutePath}:`, error);
    return 0;
  }
}

export async function ingest(options: IngestOptions = {}): Promise<void> {
  const { sources, incremental = false, limit, verbose = false } = options;

  console.log("Checking Ollama...");
  if (!(await checkOllama())) {
    console.error(
      "Ollama is not available. Please start it with: brew services start ollama",
    );
    process.exit(1);
  }

  console.log(
    `\nScanning sources${sources ? ` (${sources.join(", ")})` : ""}...`,
  );
  let files = await scanAllSources(sources);

  if (limit) {
    console.log(`Limiting to ${limit} files`);
    files = files.slice(0, limit);
  }

  console.log(`Found ${files.length} files to process`);

  if (incremental) {
    console.log("Running incremental sync (checking for changes)...");
  }

  let processed = 0;
  let skipped = 0;
  let totalChunks = 0;
  const startTime = Date.now();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const progress = `[${i + 1}/${files.length}]`;
    const pct = ((i / files.length) * 100).toFixed(1);

    // Check if we need to process this file
    const needsProcessing = await shouldProcessFile(file, incremental);
    if (!needsProcessing) {
      skipped++;
      if (verbose)
        console.log(`${progress} Skipping unchanged: ${file.relativePath}`);
      continue;
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const rate =
      processed > 0 ? (processed / (Date.now() - startTime)) * 1000 : 0;
    const eta = rate > 0 ? Math.round((files.length - i) / rate) : 0;

    if (verbose) {
      console.log(`${progress} ${pct}% | Processing: ${file.relativePath}`);
    } else if (i % 20 === 0 || i === files.length - 1) {
      console.log(
        `${progress} ${pct}% | ${elapsed}s elapsed | ${totalChunks} chunks | ETA: ${eta}s | ${file.sourceName}`,
      );
    }

    const chunks = await processFile(file, verbose);
    if (chunks > 0) {
      processed++;
      totalChunks += chunks;
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✓ Done in ${elapsed}s`);
  console.log(`  Processed: ${processed} files`);
  console.log(`  Skipped: ${skipped} files (unchanged)`);
  console.log(`  Chunks created: ${totalChunks}`);

  // Show final stats
  const stats = await getStats();
  console.log(`\nDatabase stats:`);
  console.log(`  Total chunks: ${stats.totalChunks}`);
  console.log(`  Total files: ${stats.totalFiles}`);
  console.log(`  By type:`, stats.byType);
}

// CLI
function parseArgs(): IngestOptions {
  const args = process.argv.slice(2);
  const options: IngestOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--incremental" || arg === "-i") {
      options.incremental = true;
    } else if (arg === "--verbose" || arg === "-v") {
      options.verbose = true;
    } else if (arg === "--limit" || arg === "-l") {
      options.limit = parseInt(args[++i]);
    } else if (arg === "--source" || arg === "-s") {
      options.sources = options.sources || [];
      options.sources.push(args[++i]);
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Usage: hexa-ingest [options]

Options:
  -i, --incremental  Only process files that have changed
  -s, --source NAME  Only process specific source(s) (can be repeated)
  -l, --limit N      Limit to first N files (for testing)
  -v, --verbose      Show detailed progress
  -h, --help         Show this help

Examples:
  hexa-ingest                           # Full ingestion
  hexa-ingest --incremental             # Only changed files
  hexa-ingest -s front -s bff          # Only front and bff sources
  hexa-ingest --limit 10 --verbose     # Test with 10 files
`);
      process.exit(0);
    }
  }

  return options;
}

// Main
const options = parseArgs();
try {
  await ingest(options);
} finally {
  await closePool();
}
