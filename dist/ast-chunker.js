import { Project, SyntaxKind } from "ts-morph";
// nomic-embed-text context limit is ~8192 tokens, we target ~2000 tokens max per chunk
// ~3.5 chars per token → ~7000 chars max
const MAX_CHUNK_CHARS = 7000;
/**
 * Extract code constructs (functions, classes, interfaces, types) from TypeScript.
 * Each construct becomes a separate chunk with its documentation.
 * Large constructs are subdivided to fit embedding model context.
 * Falls back to null if parsing fails or no constructs found.
 */
export function chunkByAST(content, filePath, maxChars = MAX_CHUNK_CHARS) {
    try {
        const project = new Project({
            useInMemoryFileSystem: true,
            compilerOptions: {
                allowJs: true,
                jsx: filePath.endsWith(".tsx") ? 2 : undefined, // JsxEmit.React
            },
        });
        const sourceFile = project.createSourceFile(filePath, content);
        const chunks = [];
        // Extract imports block (useful context)
        const imports = sourceFile.getImportDeclarations();
        if (imports.length > 0) {
            const importsText = imports.map((i) => i.getFullText()).join("");
            if (importsText.trim()) {
                chunks.push(`// Imports\n${importsText.trim()}`);
            }
        }
        // Extract interfaces
        for (const iface of sourceFile.getInterfaces()) {
            const docs = getLeadingComments(iface);
            const text = iface.getFullText().trim();
            chunks.push(docs ? `${docs}\n${text}` : text);
        }
        // Extract type aliases
        for (const typeAlias of sourceFile.getTypeAliases()) {
            const docs = getLeadingComments(typeAlias);
            const text = typeAlias.getFullText().trim();
            chunks.push(docs ? `${docs}\n${text}` : text);
        }
        // Extract classes
        for (const cls of sourceFile.getClasses()) {
            const docs = getLeadingComments(cls);
            const text = cls.getFullText().trim();
            chunks.push(docs ? `${docs}\n${text}` : text);
        }
        // Extract standalone functions
        for (const fn of sourceFile.getFunctions()) {
            const docs = getLeadingComments(fn);
            const text = fn.getFullText().trim();
            chunks.push(docs ? `${docs}\n${text}` : text);
        }
        // Extract exported variable declarations (const X = ...)
        for (const varStmt of sourceFile.getVariableStatements()) {
            if (varStmt.hasExportKeyword() ||
                varStmt.getFirstDescendantByKind(SyntaxKind.ArrowFunction)) {
                const docs = getLeadingComments(varStmt);
                const text = varStmt.getFullText().trim();
                chunks.push(docs ? `${docs}\n${text}` : text);
            }
        }
        // Return null if we only extracted imports or nothing at all
        if (chunks.length <= 1) {
            return null;
        }
        // Subdivide any chunks that exceed maxChars
        const finalChunks = [];
        for (const chunk of chunks) {
            if (chunk.length > maxChars) {
                finalChunks.push(...subdivideCodeChunk(chunk, maxChars));
            }
            else {
                finalChunks.push(chunk);
            }
        }
        return finalChunks;
    }
    catch {
        // Parsing failed - return null to trigger fallback
        return null;
    }
}
/**
 * Subdivide a large code chunk by logical boundaries (methods, properties).
 * Preserves context by keeping the first line (signature/header) in each sub-chunk.
 */
function subdivideCodeChunk(chunk, maxChars) {
    const lines = chunk.split("\n");
    const chunks = [];
    // Extract header (first non-empty, non-comment line that looks like a declaration)
    let headerEnd = 0;
    for (let i = 0; i < Math.min(lines.length, 10); i++) {
        const line = lines[i].trim();
        if (line.startsWith("export ") ||
            line.startsWith("class ") ||
            line.startsWith("interface ") ||
            line.startsWith("type ") ||
            line.startsWith("function ") ||
            line.startsWith("const ") ||
            line.match(/^(public|private|protected|async)\s/)) {
            headerEnd = i + 1;
            break;
        }
        // Include JSDoc/comments in header
        if (line.startsWith("/*") ||
            line.startsWith("*") ||
            line.startsWith("//")) {
            headerEnd = i + 1;
        }
    }
    const header = lines.slice(0, headerEnd).join("\n");
    const headerChars = header.length;
    let currentChunk = [];
    let currentChars = headerChars;
    for (let i = headerEnd; i < lines.length; i++) {
        const line = lines[i];
        const lineChars = line.length + 1; // +1 for newline
        if (currentChars + lineChars > maxChars && currentChunk.length > 0) {
            // Flush current chunk with header
            chunks.push(header + "\n" + currentChunk.join("\n"));
            currentChunk = [];
            currentChars = headerChars;
        }
        currentChunk.push(line);
        currentChars += lineChars;
    }
    // Don't forget the last chunk
    if (currentChunk.length > 0) {
        chunks.push(header + "\n" + currentChunk.join("\n"));
    }
    return chunks.length > 0 ? chunks : [chunk];
}
/**
 * Get leading JSDoc or comment block for a node.
 */
function getLeadingComments(node) {
    // Try to get JSDoc comments if available
    const jsDocs = node.getJsDocs?.();
    if (jsDocs && jsDocs.length > 0) {
        return jsDocs.map((d) => d.getFullText()).join("\n");
    }
    return null;
}
