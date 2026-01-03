import { OLLAMA_CONFIG } from "./config.js";
const GENERATOR_MODEL = "mistral";
/**
 * Generate a response using retrieved contexts.
 */
export async function generateAnswer(options) {
    const { query, contexts, language = "auto" } = options;
    // Build context block
    const contextBlock = contexts
        .map((c, i) => `[Source ${i + 1}: ${c.source} (${c.type})]\n${c.content.slice(0, 1500)}`)
        .join("\n\n---\n\n");
    const langInstruction = language === "fr"
        ? "Réponds en français."
        : language === "en"
            ? "Answer in English."
            : "Réponds dans la même langue que la question.";
    const prompt = `Tu es un assistant qui répond aux questions en utilisant uniquement les sources fournies.
${langInstruction}
Si les sources ne contiennent pas l'information, dis-le clairement.
Sois concis et précis.

## Sources

${contextBlock}

## Question

${query}

## Réponse`;
    const response = await fetch(`${OLLAMA_CONFIG.host}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: GENERATOR_MODEL,
            prompt,
            stream: false,
            options: {
                temperature: 0.3,
                num_predict: 500,
            },
        }),
    });
    if (!response.ok) {
        throw new Error(`Generator error: ${response.status} ${await response.text()}`);
    }
    const result = (await response.json());
    return result.response.trim();
}
/**
 * Check if generator model is available.
 */
export async function checkGenerator() {
    try {
        const response = await fetch(`${OLLAMA_CONFIG.host}/api/tags`);
        if (!response.ok)
            return false;
        const data = (await response.json());
        return (data.models?.some((m) => m.name === GENERATOR_MODEL ||
            m.name.startsWith(GENERATOR_MODEL + ":")) ?? false);
    }
    catch {
        return false;
    }
}
