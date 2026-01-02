# Plan d'implémentation - Chunking Structure-Aware

**Référence**: ADR-001
**Effort estimé**: ~1 journée

## Phase 1 : Glossary-Specific (Quick Win)

**Fichier**: `src/chunker.ts`

### Tâches

1. Créer fonction `chunkGlossary(content: string): string[]`
   - Pattern regex : `/^\*\*([^*]+)\*\*[:\s]*([\s\S]*?)(?=\n\*\*[^*]+\*\*[:\s]|\n#{1,6}\s|$)/gm`
   - Chaque match = 1 chunk atomique
   - Fallback sur contenu entier si aucun match

2. Modifier signature `chunkContent` pour accepter `ScannedFile`
   - Dispatcher basique : `if (file.sourceType === 'glossary') return chunkGlossary(content)`

3. Test manuel
   - Ingérer `ahs-documentation/glossary/terms.md`
   - Requête "qu'est-ce qu'un SX" → vérifier chunk atomique

### Critères de succès

- [ ] Chaque terme glossaire = 1 chunk
- [ ] Pas de régression sur autres types de fichiers

---

## Phase 2 : Section-Based (Markdown)

**Fichier**: `src/chunker.ts`

### Tâches

1. Créer fonction `chunkByMarkdownSections(content: string): string[]`
   - Split sur pattern `^#{1,3}\s+.+$`
   - Recombiner header + contenu suivant
   - Si section > maxTokens → subdiviser avec chunker actuel
   - Propager contexte parent optionnel (header path)

2. Étendre dispatcher

   ```typescript
   case 'knowledge':
   case 'doc':
     return chunkByMarkdownSections(content);
   ```

3. Test sur `requirements/contract/send-contract.md`
   - Sections User Journey, Business Rules, API Flow doivent être des chunks séparés

### Critères de succès

- [ ] Chaque section H2/H3 = 1 chunk (sauf si trop long)
- [ ] Header inclus dans chaque chunk pour contexte

---

## Phase 3 : AST-Based (Code TypeScript)

**Fichier**: `src/chunker.ts` + nouveau `src/ast-chunker.ts`

### Tâches

1. Ajouter dépendance `ts-morph`

   ```bash
   npm install ts-morph
   ```

2. Créer `src/ast-chunker.ts`
   - Parser le fichier TypeScript
   - Extraire : fonctions, classes, interfaces, types exportés
   - Chaque entité = 1 chunk avec ses imports pertinents

3. Gestion des erreurs de parsing
   - Try/catch → fallback sur chunker par défaut
   - Log warning pour debug

4. Étendre dispatcher
   ```typescript
   case 'code':
   case 'contract':
     return chunkByAST(content, file.absolutePath);
   ```

### Critères de succès

- [ ] Chaque fonction/classe = 1 chunk
- [ ] Imports inclus dans le contexte
- [ ] Fichiers malformés → fallback gracieux

---

## Phase 4 : Scripts Shell (Optionnel)

**Priorité**: Basse (scripts moins recherchés)

### Tâches

1. Pattern regex pour fonctions shell
   - `/^(\w+)\s*\(\)\s*\{[\s\S]*?^\}/gm`

2. Fallback : garder le script entier si < maxTokens

---

## Phase 5 : Validation et Métriques

### Tâches

1. Créer jeu de test de pertinence
   - 10-20 queries avec chunks attendus
   - Script de validation automatique

2. Comparer avant/après
   - Nombre de chunks par type
   - Précision des top-3 résultats

3. Re-ingérer toutes les sources
   ```bash
   npm run ingest -- --full
   ```

---

## Fichiers impactés

| Fichier              | Modification                              |
| -------------------- | ----------------------------------------- |
| `src/chunker.ts`     | Dispatcher + stratégies markdown/glossary |
| `src/ast-chunker.ts` | Nouveau - extraction AST TypeScript       |
| `src/config.ts`      | Éventuels nouveaux paramètres             |
| `package.json`       | Dépendance ts-morph                       |

---

## Rollback

En cas de régression majeure :

1. Revert du dispatcher → retour à `chunkContent` original
2. Les données en base restent valides (même schéma)
