#!/usr/bin/env node
interface SearchOptions {
    query: string;
    limit?: number;
    type?: string;
    verbose?: boolean;
}
export declare function search(options: SearchOptions): Promise<void>;
export {};
