/**
 * Rerank a list of documents based on relevance to query.
 * Returns indices sorted by relevance score (highest first).
 */
export declare function rerank<T>(query: string, documents: T[], getContent: (doc: T) => string, topK?: number): Promise<Array<T & {
    rerankScore: number;
}>>;
/**
 * Check if reranker model is available.
 */
export declare function checkReranker(): Promise<boolean>;
