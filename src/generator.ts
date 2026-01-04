import { getConfig, getLLMModel, LLM_MODELS } from "./config.js";

export { LLM_MODELS };

export type LLMModel = keyof typeof LLM_MODELS;

let currentLLM: string | null = null;

export function setLLM(model: LLMModel): void {
  if (!LLM_MODELS[model]) {
    throw new Error(
      `Unknown LLM: ${model}. Available: ${Object.keys(LLM_MODELS).join(", ")}`,
    );
  }
  currentLLM = LLM_MODELS[model];
}

export function getLLM(): string {
  return currentLLM || getLLMModel();
}

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
export async function generateAnswer(
  options: GenerateOptions,
): Promise<string> {
  const { query, contexts, language = "auto" } = options;

  // Build context block
  const contextBlock = contexts
    .map(
      (c, i) =>
        `[Source ${i + 1}: ${c.source} (${c.type})]\n${c.content.slice(0, 1500)}`,
    )
    .join("\n\n---\n\n");

  const langInstruction =
    language === "fr"
      ? "Réponds en français."
      : language === "en"
        ? "Answer in English."
        : "Réponds dans la même langue que la question.";

  const prompt = `Tu es un assistant qui répond aux questions en utilisant uniquement les sources fournies.
${langInstruction}
Si les sources ne contiennent pas l'information, dis-le clairement.
Utilise des références [1], [2], etc. pour citer tes sources dans ta réponse.
Sois complet mais concis.

## Sources

${contextBlock}

## Question

${query}

## Réponse`;

  const config = getConfig();
  const response = await fetch(`${config.ollama.host}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: getLLM(),
      prompt,
      stream: false,
      options: {
        temperature: 0.1,
        num_predict: 1000,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Generator error: ${response.status} ${await response.text()}`,
    );
  }

  const result = (await response.json()) as { response: string };
  return result.response.trim();
}

/**
 * Check if current generator model is available.
 */
export async function checkGenerator(): Promise<boolean> {
  try {
    const config = getConfig();
    const llm = getLLM();
    const response = await fetch(`${config.ollama.host}/api/tags`);
    if (!response.ok) return false;

    const data = (await response.json()) as { models: Array<{ name: string }> };
    return (
      data.models?.some(
        (m) => m.name === llm || m.name.startsWith(llm.split(":")[0]),
      ) ?? false
    );
  } catch {
    return false;
  }
}
