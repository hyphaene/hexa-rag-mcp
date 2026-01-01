import { glob } from "glob";
import { stat } from "fs/promises";
import { join, relative } from "path";
import { existsSync } from "fs";
import { SOURCES, type SourceConfig } from "./config.js";

export interface ScannedFile {
  absolutePath: string;
  relativePath: string;
  sourceName: string;
  sourceType: SourceConfig["type"];
  mtime: Date;
}

export async function scanSource(source: SourceConfig): Promise<ScannedFile[]> {
  if (!existsSync(source.basePath)) {
    console.warn(`Source path does not exist: ${source.basePath}`);
    return [];
  }

  const files: ScannedFile[] = [];

  for (const pattern of source.patterns) {
    const matches = await glob(pattern, {
      cwd: source.basePath,
      ignore: source.exclude,
      nodir: true,
      absolute: false,
    });

    for (const match of matches) {
      const absolutePath = join(source.basePath, match);
      try {
        const stats = await stat(absolutePath);

        // Skip files > 100KB
        if (stats.size > 100 * 1024) {
          continue;
        }

        files.push({
          absolutePath,
          relativePath: match,
          sourceName: source.name,
          sourceType: source.type,
          mtime: stats.mtime,
        });
      } catch {
        // File might have been deleted between glob and stat
        continue;
      }
    }
  }

  return files;
}

export async function scanAllSources(
  sourceNames?: string[],
): Promise<ScannedFile[]> {
  const sourcesToScan = sourceNames
    ? SOURCES.filter((s) => sourceNames.includes(s.name))
    : SOURCES;

  const allFiles: ScannedFile[] = [];

  for (const source of sourcesToScan) {
    console.log(`Scanning ${source.name}...`);
    const files = await scanSource(source);
    console.log(`  Found ${files.length} files`);
    allFiles.push(...files);
  }

  return allFiles;
}

// CLI pour tester
if (import.meta.url === `file://${process.argv[1]}`) {
  const files = await scanAllSources();
  console.log(`\nTotal: ${files.length} files`);

  // Stats par type
  const byType = files.reduce(
    (acc, f) => {
      acc[f.sourceType] = (acc[f.sourceType] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  console.log("\nBy type:", byType);
}
