import { readFile } from "fs/promises";
import { CHUNK_CONFIG } from "./config.js";
import type { ScannedFile } from "./scanner.js";

export interface Chunk {
  file: ScannedFile;
  index: number;
  content: string;
  tokenCount: number;
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
 */
export function chunkContent(
  content: string,
  maxTokens: number = CHUNK_CONFIG.maxTokens,
  overlap: number = CHUNK_CONFIG.overlap,
): string[] {
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
 */
export async function chunkFile(file: ScannedFile): Promise<Chunk[]> {
  try {
    const content = await readFile(file.absolutePath, "utf-8");

    // Skip empty files
    if (!content.trim()) {
      return [];
    }

    const chunks = chunkContent(content);

    return chunks.map((c, i) => ({
      file,
      index: i,
      content: c,
      tokenCount: estimateTokens(c),
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
