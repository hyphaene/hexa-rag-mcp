#!/usr/bin/env node
interface SearchOptions {
    query: string;
    limit?: number;
    type?: string;
    verbose?: boolean;
    model?: string;
    hybrid?: boolean;
    alpha?: number;
}
export declare function search(options: SearchOptions): Promise<void>;
export {};
