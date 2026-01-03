import { readFile } from "fs/promises";
import { CHUNK_CONFIG } from "./config.js";
import type { ScannedFile } from "./scanner.js";
import { chunkByAST } from "./ast-chunker.js";

export interface Chunk {
  file: ScannedFile;
  index: number;
  content: string;
  tokenCount: number;
  /** Contextual prefix added before content for embedding */
  context?: string;
}

/**
 * Generate contextual prefix for a chunk based on file metadata.
 * This helps the embedding model understand what the chunk is about.
 */
export function generateChunkContext(
  file: ScannedFile,
  content: string,
): string {
  const parts: string[] = [];

  // Source type context
  const typeLabels: Record<string, string> = {
    glossary: "Business glossary definition",
    knowledge: "Technical documentation",
    code: "Source code",
    contract: "API contract definition",
    script: "Shell script",
    plugin: "Claude Code plugin",
    doc: "Documentation",
  };
  parts.push(typeLabels[file.sourceType] || file.sourceType);

  // Source name for context
  parts.push(`from ${file.sourceName}`);

  // Extract topic from content if possible
  const topic = extractTopic(content, file.sourceType);
  if (topic) {
    parts.push(`about ${topic}`);
  }

  return `[${parts.join(" | ")}]\n`;
}

/**
 * Extract the main topic from chunk content.
 */
function extractTopic(content: string, sourceType: string): string | null {
  // For glossary: extract the term being defined
  if (sourceType === "glossary") {
    const match = content.match(/^\*\*([^*]+)\*\*/);
    if (match) return match[1].trim();
  }

  // For markdown: extract first header
  const headerMatch = content.match(/^#{1,3}\s+(.+)$/m);
  if (headerMatch) return headerMatch[1].trim();

  // For code: extract class/function/interface name
  if (sourceType === "code" || sourceType === "contract") {
    const codeMatch = content.match(
      /(?:export\s+)?(?:class|interface|type|function|const)\s+(\w+)/,
    );
    if (codeMatch) return codeMatch[1];
  }

  return null;
}

/**
 * Chunk glossary files by extracting individual term definitions.
 * Pattern: **TERM**: definition or **TERM (ACRO)**: definition
 * Falls back to default chunking if no terms found.
 */
function chunkGlossary(content: string): string[] | null {
  // Pattern to match glossary entries: **Term**: definition
  // Captures until next **Term**: or section header ## or end
  const termPattern =
    /^\*\*([^*]+)\*\*[:\s]*([\s\S]*?)(?=\n\*\*[^*]+\*\*[:\s]|\n#{1,6}\s|$)/gm;

  const chunks: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = termPattern.exec(content)) !== null) {
    const term = match[1].trim();
    const definition = match[2].trim();

    if (term && definition) {
      // Reconstruct as a self-contained chunk
      chunks.push(`**${term}**: ${definition}`);
    }
  }

  // Return null to signal fallback if no terms found
  if (chunks.length === 0) {
    return null;
  }

  return chunks;
}

/**
 * Chunk markdown content by sections (headers).
 * Each section becomes a chunk, subdivided if too large.
 * Falls back if no sections found.
 */
function chunkByMarkdownSections(
  content: string,
  maxTokens: number,
): string[] | null {
  // Split on headers (h1, h2, h3)
  const sectionPattern = /^(#{1,3}\s+.+)$/gm;

  // Find all header positions
  const headers: Array<{ match: string; index: number }> = [];
  let match: RegExpExecArray | null;

  while ((match = sectionPattern.exec(content)) !== null) {
    headers.push({ match: match[0], index: match.index });
  }

  // No headers found = fallback
  if (headers.length === 0) {
    return null;
  }

  const chunks: string[] = [];

  // Extract sections: header + content until next header
  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].index;
    const end = i < headers.length - 1 ? headers[i + 1].index : content.length;
    const sectionContent = content.slice(start, end).trim();

    // Check if section exceeds maxTokens
    const tokens = estimateTokens(sectionContent);
    if (tokens <= maxTokens) {
      chunks.push(sectionContent);
    } else {
      // Subdivide large sections by paragraphs
      const subChunks = subdivideSection(
        sectionContent,
        maxTokens,
        headers[i].match,
      );
      chunks.push(...subChunks);
    }
  }

  // Include any content before the first header
  if (headers.length > 0 && headers[0].index > 0) {
    const preamble = content.slice(0, headers[0].index).trim();
    if (preamble) {
      chunks.unshift(preamble);
    }
  }

  return chunks.length > 0 ? chunks : null;
}

/**
 * Subdivide a large section into smaller chunks, preserving the header.
 */
function subdivideSection(
  section: string,
  maxTokens: number,
  header: string,
): string[] {
  const lines = section.split("\n");
  const chunks: string[] = [];
  let currentChunk: string[] = [header]; // Always start with the header
  let currentTokens = estimateTokens(header);

  for (const line of lines.slice(1)) {
    // Skip the header line (already added)
    const lineTokens = estimateTokens(line);

    if (currentTokens + lineTokens > maxTokens && currentChunk.length > 1) {
      chunks.push(currentChunk.join("\n"));
      currentChunk = [header]; // New chunk starts with header for context
      currentTokens = estimateTokens(header);
    }

    currentChunk.push(line);
    currentTokens += lineTokens;
  }

  if (currentChunk.length > 1) {
    chunks.push(currentChunk.join("\n"));
  }

  return chunks;
}

/**
 * Simple tokenizer approximation.
 * Uses whitespace + punctuation splitting.
 * For more accuracy, could use tiktoken or similar.
 */
function estimateTokens(text: string): number {
  // Rough approximation: ~4 characters per token for English
  // For code, it's closer to 3
  return Math.ceil(text.length / 3.5);
}

/**
 * Split text into sentences/paragraphs for cleaner chunking.
 */
function splitIntoSegments(text: string): string[] {
  // Split on double newlines (paragraphs) or single newlines for code
  const segments = text.split(/\n\n+/);
  return segments.filter((s) => s.trim().length > 0);
}

/**
 * Chunk a file's content into segments of ~maxTokens.
 * Uses overlap to maintain context between chunks.
 * If file is provided, uses type-specific chunking strategies.
 */
export function chunkContent(
  content: string,
  maxTokens: number = CHUNK_CONFIG.maxTokens,
  overlap: number = CHUNK_CONFIG.overlap,
  file?: ScannedFile,
): string[] {
  // Type-specific dispatcher
  if (file) {
    switch (file.sourceType) {
      case "glossary": {
        const glossaryChunks = chunkGlossary(content);
        if (glossaryChunks) {
          return glossaryChunks;
        }
        // Fallback to default chunking if pattern not found
        break;
      }
      case "knowledge":
      case "doc": {
        const sectionChunks = chunkByMarkdownSections(content, maxTokens);
        if (sectionChunks) {
          return sectionChunks;
        }
        // Fallback to default chunking if no headers found
        break;
      }
      case "code":
      case "contract": {
        // Convert maxTokens to chars (~3.5 chars/token)
        const maxChars = Math.floor(maxTokens * 3.5);
        const astChunks = chunkByAST(content, file.absolutePath, maxChars);
        if (astChunks) {
          return astChunks;
        }
        // Fallback to default chunking if parsing fails
        break;
      }
    }
  }

  // Default chunking strategy
  const segments = splitIntoSegments(content);
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentTokens = 0;

  for (const segment of segments) {
    const segmentTokens = estimateTokens(segment);

    // If single segment is too large, split by lines
    if (segmentTokens > maxTokens) {
      // Flush current chunk
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.join("\n\n"));
        currentChunk = [];
        currentTokens = 0;
      }

      // Split large segment by lines
      const lines = segment.split("\n");
      let lineChunk: string[] = [];
      let lineTokens = 0;

      for (const line of lines) {
        const lt = estimateTokens(line);
        if (lineTokens + lt > maxTokens && lineChunk.length > 0) {
          chunks.push(lineChunk.join("\n"));
          // Keep last few lines for overlap
          const overlapLines = lineChunk.slice(-3);
          lineChunk = overlapLines;
          lineTokens = estimateTokens(overlapLines.join("\n"));
        }
        lineChunk.push(line);
        lineTokens += lt;
      }

      if (lineChunk.length > 0) {
        currentChunk = lineChunk;
        currentTokens = lineTokens;
      }
      continue;
    }

    // Would adding this segment exceed the limit?
    if (currentTokens + segmentTokens > maxTokens && currentChunk.length > 0) {
      chunks.push(currentChunk.join("\n\n"));

      // Keep last segment(s) for overlap
      const lastSegment = currentChunk[currentChunk.length - 1];
      if (estimateTokens(lastSegment) <= overlap) {
        currentChunk = [lastSegment];
        currentTokens = estimateTokens(lastSegment);
      } else {
        currentChunk = [];
        currentTokens = 0;
      }
    }

    currentChunk.push(segment);
    currentTokens += segmentTokens;
  }

  // Don't forget the last chunk
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join("\n\n"));
  }

  return chunks;
}

/**
 * Read and chunk a file.
 * @param file - The file to chunk
 * @param maxTokens - Optional max tokens per chunk (defaults to CHUNK_CONFIG.maxTokens)
 */
export async function chunkFile(
  file: ScannedFile,
  maxTokens?: number,
): Promise<Chunk[]> {
  try {
    const content = await readFile(file.absolutePath, "utf-8");

    // Skip empty files
    if (!content.trim()) {
      return [];
    }

    const chunks = chunkContent(
      content,
      maxTokens ?? CHUNK_CONFIG.maxTokens,
      CHUNK_CONFIG.overlap,
      file,
    );

    return chunks.map((c, i) => ({
      file,
      index: i,
      content: c,
      tokenCount: estimateTokens(c),
      context: generateChunkContext(file, c),
    }));
  } catch (error) {
    console.error(`Error reading ${file.absolutePath}:`, error);
    return [];
  }
}

// CLI pour tester
if (import.meta.url === `file://${process.argv[1]}`) {
  const testContent = `
# Title

This is a paragraph with some content that explains something.

## Section 1

More content here that describes the section in detail.
It has multiple lines and explains various concepts.

## Section 2

Another section with different content.

\`\`\`typescript
function example() {
  console.log("hello");
}
\`\`\`

Final paragraph.
`;

  const chunks = chunkContent(testContent, 100, 20);
  console.log(`Created ${chunks.length} chunks:`);
  chunks.forEach((c, i) => {
    console.log(`\n--- Chunk ${i} (${estimateTokens(c)} tokens) ---`);
    console.log(c.slice(0, 200) + (c.length > 200 ? "..." : ""));
  });
}
