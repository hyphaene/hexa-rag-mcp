#!/usr/bin/env node
interface IngestOptions {
    sources?: string[];
    incremental?: boolean;
    limit?: number;
    verbose?: boolean;
    model?: string;
}
export declare function ingest(options?: IngestOptions): Promise<void>;
export {};
