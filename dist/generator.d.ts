interface GenerateOptions {
    query: string;
    contexts: Array<{
        content: string;
        source: string;
        type: string;
    }>;
    language?: "fr" | "en" | "auto";
}
/**
 * Generate a response using retrieved contexts.
 */
export declare function generateAnswer(options: GenerateOptions): Promise<string>;
/**
 * Check if generator model is available.
 */
export declare function checkGenerator(): Promise<boolean>;
export {};
