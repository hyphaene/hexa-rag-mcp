import pg from "pg";
import pgvector from "pgvector/pg";
import { DB_CONFIG } from "./config.js";
import type { Chunk } from "./chunker.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;
let typesRegistered = false;

export async function getPool(): Promise<pg.Pool> {
  if (!pool) {
    pool = new Pool(DB_CONFIG);
  }

  // Register pgvector types on first client connection
  if (!typesRegistered) {
    const client = await pool.connect();
    try {
      await pgvector.registerTypes(client);
      typesRegistered = true;
    } finally {
      client.release();
    }
  }

  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export interface StoredChunk {
  id: number;
  source_path: string;
  source_name: string;
  source_type: string;
  chunk_index: number;
  content: string;
  created_at: Date;
}

/**
 * Insert a chunk with its embedding.
 */
export async function insertChunk(
  chunk: Chunk,
  embedding: number[],
): Promise<void> {
  const pool = await getPool();

  await pool.query(
    `INSERT INTO chunks (source_path, source_name, source_type, chunk_index, content, embedding)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (source_path, chunk_index)
     DO UPDATE SET content = $5, embedding = $6, created_at = NOW()`,
    [
      chunk.file.absolutePath,
      chunk.file.sourceName,
      chunk.file.sourceType,
      chunk.index,
      chunk.content,
      pgvector.toSql(embedding),
    ],
  );
}

/**
 * Insert multiple chunks at once (more efficient).
 */
export async function insertChunks(
  chunks: Array<{ chunk: Chunk; embedding: number[] }>,
): Promise<void> {
  if (chunks.length === 0) return;

  const pool = await getPool();

  // Build bulk insert
  const values: unknown[] = [];
  const placeholders: string[] = [];

  chunks.forEach((item, i) => {
    const base = i * 6;
    placeholders.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`,
    );
    values.push(
      item.chunk.file.absolutePath,
      item.chunk.file.sourceName,
      item.chunk.file.sourceType,
      item.chunk.index,
      item.chunk.content,
      pgvector.toSql(item.embedding),
    );
  });

  await pool.query(
    `INSERT INTO chunks (source_path, source_name, source_type, chunk_index, content, embedding)
     VALUES ${placeholders.join(", ")}
     ON CONFLICT (source_path, chunk_index)
     DO UPDATE SET content = EXCLUDED.content, embedding = EXCLUDED.embedding, created_at = NOW()`,
    values,
  );
}

/**
 * Delete all chunks for a file (before re-indexing).
 */
export async function deleteChunksForFile(filePath: string): Promise<void> {
  const pool = await getPool();
  await pool.query("DELETE FROM chunks WHERE source_path = $1", [filePath]);
}

/**
 * Search for similar chunks.
 */
export async function searchSimilar(
  embedding: number[],
  limit: number = 10,
  sourceType?: string,
): Promise<Array<StoredChunk & { similarity: number }>> {
  const pool = await getPool();

  const typeFilter = sourceType ? "AND source_type = $3" : "";
  const params = sourceType
    ? [pgvector.toSql(embedding), limit, sourceType]
    : [pgvector.toSql(embedding), limit];

  const result = await pool.query<StoredChunk & { similarity: number }>(
    `SELECT id, source_path, source_name, source_type, chunk_index, content, created_at,
            1 - (embedding <=> $1) as similarity
     FROM chunks
     WHERE embedding IS NOT NULL ${typeFilter}
     ORDER BY embedding <=> $1
     LIMIT $2`,
    params,
  );

  return result.rows;
}

/**
 * Get sync state for a file.
 */
export async function getSyncState(
  filePath: string,
): Promise<{ last_mtime: Date; file_hash: string } | null> {
  const pool = await getPool();
  const result = await pool.query(
    "SELECT last_mtime, file_hash FROM sync_state WHERE source_path = $1",
    [filePath],
  );
  return result.rows[0] || null;
}

/**
 * Update sync state for a file.
 */
export async function updateSyncState(
  filePath: string,
  mtime: Date,
  hash: string,
): Promise<void> {
  const pool = await getPool();
  await pool.query(
    `INSERT INTO sync_state (source_path, last_mtime, file_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (source_path)
     DO UPDATE SET last_mtime = $2, file_hash = $3`,
    [filePath, mtime, hash],
  );
}

/**
 * Get stats about indexed content.
 */
export async function getStats(): Promise<{
  totalChunks: number;
  totalFiles: number;
  byType: Record<string, number>;
  bySource: Record<string, number>;
}> {
  const pool = await getPool();

  const [totalResult, byTypeResult, bySourceResult] = await Promise.all([
    pool.query(
      "SELECT COUNT(*) as count, COUNT(DISTINCT source_path) as files FROM chunks",
    ),
    pool.query(
      "SELECT source_type, COUNT(*) as count FROM chunks GROUP BY source_type",
    ),
    pool.query(
      "SELECT source_name, COUNT(*) as count FROM chunks GROUP BY source_name",
    ),
  ]);

  const byType: Record<string, number> = {};
  for (const row of byTypeResult.rows) {
    byType[row.source_type] = parseInt(row.count);
  }

  const bySource: Record<string, number> = {};
  for (const row of bySourceResult.rows) {
    bySource[row.source_name] = parseInt(row.count);
  }

  return {
    totalChunks: parseInt(totalResult.rows[0].count),
    totalFiles: parseInt(totalResult.rows[0].files),
    byType,
    bySource,
  };
}

// CLI pour tester
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("Testing database connection...");
  const pool = await getPool();

  const result = await pool.query("SELECT version()");
  console.log("PostgreSQL version:", result.rows[0].version);

  const stats = await getStats();
  console.log("Current stats:", stats);

  await closePool();
}
