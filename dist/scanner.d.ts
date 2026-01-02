import { type SourceConfig } from "./config.js";
export interface ScannedFile {
    absolutePath: string;
    relativePath: string;
    sourceName: string;
    sourceType: SourceConfig["type"];
    mtime: Date;
}
export declare function scanSource(source: SourceConfig): Promise<ScannedFile[]>;
export declare function scanAllSources(sourceNames?: string[]): Promise<ScannedFile[]>;
