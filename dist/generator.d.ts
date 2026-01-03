export declare const LLM_MODELS: {
    readonly qwen: "qwen2.5:7b";
    readonly deepseek: "deepseek-r1:8b";
};
export type LLMModel = keyof typeof LLM_MODELS;
export declare function setLLM(model: LLMModel): void;
export declare function getLLM(): string;
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
 * Check if current generator model is available.
 */
export declare function checkGenerator(): Promise<boolean>;
export {};
