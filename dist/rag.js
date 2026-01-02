#!/usr/bin/env node
/**
 * RAG: Retrieval-Augmented Generation
 * Search + LLM synthesis
 */
import { getEmbedding, checkOllama } from "./embedder.js";
import { searchSimilar, closePool } from "./db.js";
const LLM_MODEL = "mistral";
async function generateAnswer(question, context) {
    const prompt = `Tu es un assistant expert. Réponds à la question en te basant UNIQUEMENT sur le contexte fourni.
Si le contexte ne contient pas assez d'information, dis-le clairement.

CONTEXTE:
${context}

QUESTION: ${question}

RÉPONSE:`;
    const response = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: LLM_MODEL,
            prompt,
            stream: false,
        }),
    });
    if (!response.ok) {
        throw new Error(`LLM error: ${response.status}`);
    }
    const result = (await response.json());
    return result.response;
}
async function rag(question, limit = 5) {
    console.log(`Question: ${question}\n`);
    console.log("Recherche de contexte...");
    // 1. Get embedding for question
    const embedding = await getEmbedding(question);
    // 2. Search similar chunks
    const results = await searchSimilar(embedding, limit);
    if (results.length === 0) {
        console.log("Aucun contexte trouvé.");
        return;
    }
    console.log(`${results.length} chunks trouvés (${results.map((r) => `${(r.similarity * 100).toFixed(0)}%`).join(", ")})`);
    console.log("\nGénération de la réponse...\n");
    // 3. Build context from chunks
    const context = results
        .map((r, i) => `[Source ${i + 1}: ${r.source_name}/${r.source_type}]\n${r.content}`)
        .join("\n\n---\n\n");
    // 4. Generate answer with LLM
    const answer = await generateAnswer(question, context);
    console.log("─".repeat(60));
    console.log(answer);
    console.log("─".repeat(60));
    console.log("\nSources:");
    results.forEach((r, i) => {
        const path = r.source_path.replace(process.env.HOME || "", "~");
        console.log(`  ${i + 1}. [${(r.similarity * 100).toFixed(0)}%] ${path}`);
    });
}
// CLI
const args = process.argv.slice(2);
const question = args.filter((a) => !a.startsWith("-")).join(" ");
const limit = args.includes("-l") ? parseInt(args[args.indexOf("-l") + 1]) : 5;
if (!question || args.includes("-h") || args.includes("--help")) {
    console.log(`
Usage: hexa-rag <question>

Options:
  -l N     Nombre de chunks de contexte (default: 5)
  -h       Aide

Exemples:
  hexa-rag "Comment fonctionne la validation du budget ?"
  hexa-rag "Quels sont les status possibles d'une SX ?" -l 3
`);
    process.exit(0);
}
// Check services
if (!(await checkOllama())) {
    console.error("Ollama n'est pas démarré. Lance: brew services start ollama");
    process.exit(1);
}
try {
    await rag(question, limit);
}
finally {
    await closePool();
}
