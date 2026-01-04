#!/usr/bin/env node
/**
 * MCP Server for hexa-vector semantic search
 * Exposes search, RAG, and stats functionality to Claude Code
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { getEmbedding, checkOllama, setModel, getModel } from "./embedder.js";
import {
  searchSimilar,
  searchHybrid,
  getStats,
  closePool,
  setDbModel,
} from "./db.js";
import { rerank, checkReranker } from "./reranker.js";
import {
  generateAnswer,
  checkGenerator,
  setLLM,
  LLM_MODELS,
  type LLMModel,
} from "./generator.js";

const server = new McpServer({
  name: "hexa-vector",
  version: "1.0.0",
});

// Helper to format paths
function formatPath(path: string): string {
  const home = process.env.HOME || "";
  if (path.startsWith(home)) {
    return "~" + path.slice(home.length);
  }
  return path;
}

// Tool: search
server.tool(
  "search",
  "Search the Hexactitude knowledge base using semantic similarity. Searches across knowledge files, scripts, plugins, glossary, front/bff code, and contracts.",
  {
    query: z.string().describe("Search query in natural language"),
    limit: z.number().optional().default(10).describe("Number of results"),
    type: z
      .enum(["knowledge", "script", "plugin", "glossary", "code", "contract"])
      .optional()
      .describe("Filter by source type"),
    model: z
      .enum(["nomic", "e5", "bge"])
      .optional()
      .default("nomic")
      .describe("Embedding model (nomic=fast, bge=multilingual)"),
    hybrid: z
      .boolean()
      .optional()
      .default(false)
      .describe("Use hybrid search (vector + BM25) - good for exact matches"),
    alpha: z
      .number()
      .optional()
      .default(0.7)
      .describe("Vector weight for hybrid search (0-1, higher=more semantic)"),
    rerank: z
      .boolean()
      .optional()
      .default(false)
      .describe("Rerank results with cross-encoder (slower but more accurate)"),
  },
  async ({ query, limit, type, model, hybrid, alpha, rerank: useRerank }) => {
    try {
      // Set model
      const modelConfig = setModel(model);
      setDbModel(modelConfig);

      // Check Ollama
      if (!(await checkOllama())) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: Ollama is not available. Start it with: brew services start ollama",
            },
          ],
        };
      }

      // Check reranker if needed
      if (useRerank && !(await checkReranker())) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: Reranker model not available. Run: ollama pull qllama/bge-reranker-v2-m3",
            },
          ],
        };
      }

      // Get embedding
      const embedding = await getEmbedding(query);

      // Search
      const fetchLimit = useRerank ? Math.max(limit * 3, 20) : limit;
      let results = hybrid
        ? await searchHybrid(embedding, query, fetchLimit, alpha)
        : await searchSimilar(embedding, fetchLimit, type);

      if (results.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No results found." }],
        };
      }

      // Rerank if requested
      if (useRerank) {
        results = await rerank(query, results, (r) => r.content, limit);
      }

      // Format results
      const mode = hybrid
        ? `hybrid (α=${alpha})`
        : "vector" + (useRerank ? " + rerank" : "");
      const formattedResults = results.slice(0, limit).map((r, i) => {
        const path = formatPath(r.source_path);
        const similarity = (r.similarity * 100).toFixed(1);
        const firstLine = r.content.split("\n").find((l) => l.trim()) || "";
        const preview =
          firstLine.slice(0, 100) + (firstLine.length > 100 ? "..." : "");

        let score = `${similarity}%`;
        if ("hybrid_score" in r) {
          const hr = r as typeof r & {
            hybrid_score: number;
            bm25_rank: number;
          };
          score = `rrf:${(hr.hybrid_score * 1000).toFixed(1)} (vec:${similarity}%, bm25:#${hr.bm25_rank})`;
        }
        if ("rerankScore" in r) {
          const rr = r as typeof r & { rerankScore: number };
          score = `rerank:${rr.rerankScore.toFixed(2)} (vec:${similarity}%)`;
        }

        return `${i + 1}. [${score}] ${r.source_name}/${r.source_type}\n   ${path}\n   ${preview}`;
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `Found ${results.length} results for "${query}" [model: ${model}, mode: ${mode}]\n\n${formattedResults.join("\n\n")}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  },
);

// Tool: rag
server.tool(
  "rag",
  "Search and generate a synthesized answer using RAG (Retrieval Augmented Generation). Best for questions that need a comprehensive answer from multiple sources.",
  {
    query: z.string().describe("Question to answer"),
    model: z
      .enum(["nomic", "e5", "bge"])
      .optional()
      .default("bge")
      .describe("Embedding model (bge recommended for RAG)"),
    llm: z
      .enum(["qwen", "deepseek"])
      .optional()
      .default("qwen")
      .describe("LLM for answer generation"),
  },
  async ({ query, model, llm }) => {
    try {
      // Set models
      setLLM(llm as LLMModel);
      const modelConfig = setModel(model);
      setDbModel(modelConfig);

      // Check services
      if (!(await checkOllama())) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: Ollama is not available. Start it with: brew services start ollama",
            },
          ],
        };
      }

      if (!(await checkGenerator())) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: LLM ${llm} not available. Run: ollama pull ${LLM_MODELS[llm as LLMModel]}`,
            },
          ],
        };
      }

      // Get embedding and search
      const embedding = await getEmbedding(query);
      const results = await searchSimilar(embedding, 5);

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No relevant documents found to answer this question.",
            },
          ],
        };
      }

      // Prepare contexts
      const contexts = results.map((r) => ({
        content: r.content,
        source: formatPath(r.source_path),
        type: r.source_type,
      }));

      // Generate answer
      const answer = await generateAnswer({ query, contexts });

      // Format sources
      const sources = contexts
        .map((c, i) => `[${i + 1}] ${c.source} (${c.type})`)
        .join("\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `## Answer\n\n${answer}\n\n## Sources\n\n${sources}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  },
);

// Tool: stats
server.tool(
  "stats",
  "Get statistics about the indexed knowledge base (chunks, files, types, sources)",
  {},
  async () => {
    try {
      const stats = await getStats();

      const byTypeLines = Object.entries(stats.byType)
        .map(([type, count]) => `  ${type}: ${count}`)
        .join("\n");

      const bySourceLines = Object.entries(stats.bySource)
        .map(([source, count]) => `  ${source}: ${count}`)
        .join("\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `Database statistics:\n  Total chunks: ${stats.totalChunks}\n  Total files: ${stats.totalFiles}\n\nBy type:\n${byTypeLines}\n\nBy source:\n${bySourceLines}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  },
);

// Cleanup on exit
process.on("SIGINT", async () => {
  await closePool();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await closePool();
  process.exit(0);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
