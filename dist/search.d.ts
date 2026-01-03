#!/usr/bin/env node
import { type LLMModel } from "./generator.js";
interface SearchOptions {
    query: string;
    limit?: number;
    type?: string;
    verbose?: boolean;
    model?: string;
    hybrid?: boolean;
    alpha?: number;
    useRerank?: boolean;
    rag?: boolean;
    llm?: LLMModel;
}
export declare function search(options: SearchOptions): Promise<void>;
export {};
