#!/usr/bin/env node
/**
 * MCP Server for hexa-vector semantic search
 * Exposes search functionality to Claude Code agents
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getEmbedding, checkOllama } from "./embedder.js";
import { searchSimilar, getStats, closePool } from "./db.js";

const server = new Server(
  {
    name: "hexa-vector",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "semantic_search",
        description:
          "Search the Hexactitude knowledge base, code, and documentation using semantic similarity. Use this to find relevant content across all indexed sources (knowledge files, scripts, plugins, glossary, front/bff code, contracts).",
        inputSchema: {
          type: "object" as const,
          properties: {
            query: {
              type: "string",
              description: "The search query in natural language",
            },
            limit: {
              type: "number",
              description: "Maximum number of results (default: 10)",
            },
            type: {
              type: "string",
              enum: [
                "knowledge",
                "script",
                "plugin",
                "glossary",
                "code",
                "contract",
              ],
              description: "Filter by source type (optional)",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "search_stats",
        description:
          "Get statistics about the indexed content in hexa-vector database",
        inputSchema: {
          type: "object" as const,
          properties: {},
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "semantic_search") {
    const {
      query,
      limit = 10,
      type,
    } = args as {
      query: string;
      limit?: number;
      type?: string;
    };

    try {
      // Check Ollama
      if (!(await checkOllama())) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: Ollama is not running. Start it with: brew services start ollama",
            },
          ],
        };
      }

      // Get embedding and search
      const embedding = await getEmbedding(query);
      const results = await searchSimilar(embedding, limit, type);

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No results found for: "${query}"`,
            },
          ],
        };
      }

      // Format results
      const formatted = results
        .map((r, i) => {
          const similarity = (r.similarity * 100).toFixed(1);
          const preview = r.content
            .split("\n")
            .slice(0, 3)
            .join(" ")
            .slice(0, 200);
          return `${i + 1}. [${similarity}%] ${r.source_name}/${r.source_type}
   ${r.source_path}
   ${preview}${preview.length >= 200 ? "..." : ""}`;
        })
        .join("\n\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `Found ${results.length} results for "${query}":\n\n${formatted}`,
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
  }

  if (name === "search_stats") {
    try {
      const stats = await getStats();
      return {
        content: [
          {
            type: "text" as const,
            text: `Hexa-Vector Database Stats:
- Total chunks: ${stats.totalChunks}
- Total files: ${stats.totalFiles}

By type:
${Object.entries(stats.byType)
  .map(([k, v]) => `  ${k}: ${v}`)
  .join("\n")}

By source:
${Object.entries(stats.bySource)
  .map(([k, v]) => `  ${k}: ${v}`)
  .join("\n")}`,
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
  }

  return {
    content: [
      {
        type: "text" as const,
        text: `Unknown tool: ${name}`,
      },
    ],
  };
});

// Cleanup on exit
process.on("SIGINT", async () => {
  await closePool();
  process.exit(0);
});

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
