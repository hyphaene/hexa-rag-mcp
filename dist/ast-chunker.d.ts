/**
 * Extract code constructs (functions, classes, interfaces, types) from TypeScript.
 * Each construct becomes a separate chunk with its documentation.
 * Falls back to null if parsing fails or no constructs found.
 */
export declare function chunkByAST(content: string, filePath: string): string[] | null;
