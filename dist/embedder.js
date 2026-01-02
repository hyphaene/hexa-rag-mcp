import { OLLAMA_CONFIG } from "./config.js";
/**
 * Get embedding from Ollama for a single text.
 */
export async function getEmbedding(text) {
    const response = await fetch(`${OLLAMA_CONFIG.host}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: OLLAMA_CONFIG.model,
            prompt: text,
        }),
    });
    if (!response.ok) {
        throw new Error(`Ollama error: ${response.status} ${await response.text()}`);
    }
    const result = (await response.json());
    return result.embedding;
}
/**
 * Get embeddings for multiple texts in batch.
 * Ollama doesn't support true batching, so we process sequentially
 * but with error handling and progress tracking.
 */
export async function getEmbeddings(texts, onProgress) {
    const embeddings = [];
    for (let i = 0; i < texts.length; i++) {
        try {
            const embedding = await getEmbedding(texts[i]);
            embeddings.push(embedding);
            onProgress?.(i + 1, texts.length);
        }
        catch (error) {
            console.error(`Error getting embedding for text ${i}:`, error);
            // Return zero vector on error to maintain alignment
            embeddings.push(new Array(OLLAMA_CONFIG.dimensions).fill(0));
        }
    }
    return embeddings;
}
/**
 * Check if Ollama is running and model is available.
 */
export async function checkOllama() {
    try {
        const response = await fetch(`${OLLAMA_CONFIG.host}/api/tags`);
        if (!response.ok)
            return false;
        const data = (await response.json());
        const hasModel = data.models?.some((m) => m.name === OLLAMA_CONFIG.model ||
            m.name === `${OLLAMA_CONFIG.model}:latest`);
        if (!hasModel) {
            console.error(`Model ${OLLAMA_CONFIG.model} not found. Available:`, data.models?.map((m) => m.name));
        }
        return hasModel;
    }
    catch {
        console.error("Ollama is not running");
        return false;
    }
}
// CLI pour tester
if (import.meta.url === `file://${process.argv[1]}`) {
    console.log("Checking Ollama...");
    const ok = await checkOllama();
    if (!ok) {
        process.exit(1);
    }
    console.log("Getting test embedding...");
    const start = Date.now();
    const embedding = await getEmbedding("Hello, this is a test sentence.");
    const elapsed = Date.now() - start;
    console.log(`Embedding dimensions: ${embedding.length}`);
    console.log(`Time: ${elapsed}ms`);
    console.log(`First 5 values: ${embedding.slice(0, 5).join(", ")}`);
}
