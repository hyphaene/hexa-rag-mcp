import pg from "pg";
import pgvector from "pgvector/pg";
import { DB_CONFIG, type EmbeddingModel, getEmbeddingModel } from "./config.js";
import type { Chunk } from "./chunker.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;
let typesRegistered = false;

// Current model determines table name
let currentModel: EmbeddingModel = getEmbeddingModel();

/**
 * Set the model (determines which table to use).
 */
export function setDbModel(model: EmbeddingModel): void {
  currentModel = model;
}

/**
 * Get table name for current model.
 */
function getTableName(): string {
  return `chunks_${currentModel.name}`;
}

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

/**
 * Ensure table exists for current model.
 */
export async function ensureTable(): Promise<void> {
  const pool = await getPool();
  const table = getTableName();
  const dim = currentModel.dimensions;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${table} (
      id SERIAL PRIMARY KEY,
      source_path TEXT NOT NULL,
      source_name TEXT NOT NULL,
      source_type TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      embedding vector(${dim}),
      tsv tsvector,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(source_path, chunk_index)
    )
  `);

  // Create indexes if not exist
  await pool.query(`
    CREATE INDEX IF NOT EXISTS ${table}_embedding_idx
    ON ${table} USING hnsw (embedding vector_cosine_ops)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS ${table}_source_type_idx
    ON ${table} (source_type)
  `);
  // GIN index for full-text search
  await pool.query(`
    CREATE INDEX IF NOT EXISTS ${table}_tsv_idx
    ON ${table} USING gin (tsv)
  `);
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
 * Also generates tsvector for full-text search.
 */
export async function insertChunk(
  chunk: Chunk,
  embedding: number[],
): Promise<void> {
  const pool = await getPool();
  const table = getTableName();

  await pool.query(
    `INSERT INTO ${table} (source_path, source_name, source_type, chunk_index, content, embedding, tsv)
     VALUES ($1, $2, $3, $4, $5, $6, to_tsvector('english', $5))
     ON CONFLICT (source_path, chunk_index)
     DO UPDATE SET content = $5, embedding = $6, tsv = to_tsvector('english', $5), created_at = NOW()`,
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
  const table = getTableName();

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
    `INSERT INTO ${table} (source_path, source_name, source_type, chunk_index, content, embedding)
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
  const table = getTableName();
  await pool.query(`DELETE FROM ${table} WHERE source_path = $1`, [filePath]);
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
  const table = getTableName();

  const typeFilter = sourceType ? "AND source_type = $3" : "";
  const params = sourceType
    ? [pgvector.toSql(embedding), limit, sourceType]
    : [pgvector.toSql(embedding), limit];

  const result = await pool.query<StoredChunk & { similarity: number }>(
    `SELECT id, source_path, source_name, source_type, chunk_index, content, created_at,
            1 - (embedding <=> $1) as similarity
     FROM ${table}
     WHERE embedding IS NOT NULL ${typeFilter}
     ORDER BY embedding <=> $1
     LIMIT $2`,
    params,
  );

  return result.rows;
}

/**
 * Hybrid search combining vector similarity and BM25 full-text search.
 * Uses Reciprocal Rank Fusion (RRF) to combine scores.
 * @param embedding - Query embedding vector
 * @param query - Original query text for BM25
 * @param limit - Number of results to return
 * @param alpha - Weight for vector search (0-1), BM25 weight = 1-alpha
 */
export async function searchHybrid(
  embedding: number[],
  query: string,
  limit: number = 10,
  alpha: number = 0.7,
): Promise<
  Array<
    StoredChunk & {
      similarity: number;
      bm25_rank: number;
      hybrid_score: number;
    }
  >
> {
  const pool = await getPool();
  const table = getTableName();
  const k = 60; // RRF constant

  // Use Reciprocal Rank Fusion to combine vector and BM25 rankings
  // RRF(d) = Σ 1/(k + rank(d)) for each ranking
  const result = await pool.query<
    StoredChunk & {
      similarity: number;
      bm25_rank: number;
      hybrid_score: number;
    }
  >(
    `WITH vector_search AS (
      SELECT id, 1 - (embedding <=> $1) as similarity,
             ROW_NUMBER() OVER (ORDER BY embedding <=> $1) as vec_rank
      FROM ${table}
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> $1
      LIMIT 100
    ),
    bm25_search AS (
      SELECT id, ts_rank_cd(tsv, plainto_tsquery('english', $2)) as bm25_score,
             ROW_NUMBER() OVER (ORDER BY ts_rank_cd(tsv, plainto_tsquery('english', $2)) DESC) as bm25_rank
      FROM ${table}
      WHERE tsv @@ plainto_tsquery('english', $2)
      ORDER BY bm25_score DESC
      LIMIT 100
    ),
    combined AS (
      SELECT
        COALESCE(v.id, b.id) as id,
        COALESCE(v.similarity, 0) as similarity,
        COALESCE(b.bm25_rank, 100) as bm25_rank,
        -- RRF score: weighted combination of reciprocal ranks
        $4 * (1.0 / ($5 + COALESCE(v.vec_rank, 100))) +
        (1 - $4) * (1.0 / ($5 + COALESCE(b.bm25_rank, 100))) as hybrid_score
      FROM vector_search v
      FULL OUTER JOIN bm25_search b ON v.id = b.id
    )
    SELECT c.id, c.source_path, c.source_name, c.source_type, c.chunk_index,
           c.content, c.created_at, combined.similarity, combined.bm25_rank, combined.hybrid_score
    FROM combined
    JOIN ${table} c ON c.id = combined.id
    ORDER BY combined.hybrid_score DESC
    LIMIT $3`,
    [pgvector.toSql(embedding), query, limit, alpha, k],
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
  const table = getTableName();

  const [totalResult, byTypeResult, bySourceResult] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) as count, COUNT(DISTINCT source_path) as files FROM ${table}`,
    ),
    pool.query(
      `SELECT source_type, COUNT(*) as count FROM ${table} GROUP BY source_type`,
    ),
    pool.query(
      `SELECT source_name, COUNT(*) as count FROM ${table} GROUP BY source_name`,
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
