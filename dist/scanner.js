import { glob } from "glob";
import { stat } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { SOURCES } from "./config.js";
export async function scanSource(source) {
    if (!existsSync(source.basePath)) {
        console.warn(`Source path does not exist: ${source.basePath}`);
        return [];
    }
    const files = [];
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
            }
            catch {
                // File might have been deleted between glob and stat
                continue;
            }
        }
    }
    return files;
}
export async function scanAllSources(sourceNames) {
    const sourcesToScan = sourceNames
        ? SOURCES.filter((s) => sourceNames.includes(s.name))
        : SOURCES;
    const allFiles = [];
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
    const byType = files.reduce((acc, f) => {
        acc[f.sourceType] = (acc[f.sourceType] || 0) + 1;
        return acc;
    }, {});
    console.log("\nBy type:", byType);
}
