import { Project, SyntaxKind } from "ts-morph";
/**
 * Extract code constructs (functions, classes, interfaces, types) from TypeScript.
 * Each construct becomes a separate chunk with its documentation.
 * Falls back to null if parsing fails or no constructs found.
 */
export function chunkByAST(content, filePath) {
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
        return chunks;
    }
    catch {
        // Parsing failed - return null to trigger fallback
        return null;
    }
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
