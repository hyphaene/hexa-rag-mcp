# Plan : Vector Search Local pour Hexactitude

## Vue d'ensemble

Setup d'un système de recherche sémantique 100% local sur Mac Mini M4 Pro (24GB RAM).

**Stack choisie :** Ollama + pgvector + Node.js

---

## Inventaire complet du contenu à indexer

### Groupe 1 : Hexactitude (tooling Claude Code)

| Source | Type | Fichiers | Description |
|--------|------|----------|-------------|
| `~/Hexactitude/**/*.md` | doc | ~1214 | Documentation, rapports, analyses |
| `~/Hexactitude/**/*.sh` | script | ~720 | Scripts shell (Jira, Git, utils) |
| `~/Hexactitude/**/*.ts` | code | ~18 | Code TypeScript |
| `~/Hexactitude/**/*.json` | config | ~692 | Configs, manifests |

#### Détail par catégorie Hexactitude

| Dossier | Contenu |
|---------|---------|
| `claude/marketplace/plugins/` | 8 plugins source (cc-utils, jira, prep-kit, flow-kit, slack, adeo-infra, code-writer, dev-setup) |
| `claude/workflows/` | Workflows documentés (worktree, etc.) |
| `claude/commands/` | Slash commands legacy (prep-kit, pr, workflow) |
| `claude/scripts/` | ~91 scripts shell (jira, git, gh) |
| `claude/docs/` | Concepts, architecture |
| `claude/references/` | Static analysis rules, colocation |
| `claude/rapports/` | Audits de skills |

### Groupe 2 : Documentation métier Adeo

| Source | Fichiers | Description |
|--------|----------|-------------|
| `~/Adeo/ahs-documentation/**/*.md` | 42 | Glossaire, requirements, specs |

#### Détail ahs-documentation

| Dossier | Contenu |
|---------|---------|
| `glossary/` | Termes métier (SX, WCF, distribution...) |
| `requirements/` | Specs fonctionnelles par feature |
| `organization/` | Teams, stakeholders |
| `external-screens/` | Interfaces externes |

### Groupe 3 : Code source projets Adeo

| Source | Fichiers | Lignes | Description |
|--------|----------|--------|-------------|
| `front/src/**/*.{ts,vue}` | 597 | ~39K | Vue.js frontend |
| `bff/src/**/*.ts` | 345 | ~32K | NestJS backend |
| `contracts/src/**/*.ts` | 86 | - | ts-rest contracts |

**Total code : ~1028 fichiers, ~70K lignes**

### Récapitulatif total

| Groupe | Fichiers | Type principal |
|--------|----------|----------------|
| Hexactitude | ~2644 | md, sh, json |
| ahs-documentation | 42 | md |
| Code Adeo | ~1028 | ts, vue |
| **TOTAL** | **~3714** | - |

### Exclusions

- `**/node_modules/**`
- `**/gitignored/**`
- `**/.git/**`
- `**/dist/**`, `**/build/**`
- `**/cache/**` (plugins cache = duplicata)
- Fichiers > 100KB (probablement générés)
- `*.lock`, `*.log`

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         INGESTION                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Scanner        Chunker         Ollama            PostgreSQL    │
│  ────────►     ────────►      ────────►          ────────►     │
│  (fichiers)    (500 tokens)   (embedding)        (pgvector)     │
│                                                                 │
│  Métadonnées stockées :                                         │
│  - source_path (chemin absolu)                                  │
│  - source_type (knowledge|glossary|skill|code)                  │
│  - chunk_index                                                  │
│  - content (texte brut du chunk)                                │
│  - embedding (vecteur 768 dimensions)                           │
│  - created_at                                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         RECHERCHE                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  CLI/API        Ollama           PostgreSQL        Résultats    │
│  ────────►     ────────►        ────────►         ────────►    │
│  (prompt)      (embedding)      (cosine <=>)      (top 10)      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phases d'implémentation

### Phase 0 : Prérequis système

```bash
# 1. PostgreSQL 16 avec pgvector
brew install postgresql@16
brew services start postgresql@16

# 2. Ollama
brew install ollama
ollama pull nomic-embed-text   # ~800MB, embedding model

# 3. Node.js (tu l'as déjà via asdf)
```

**RAM estimée :**
- PostgreSQL : ~100-500MB
- Ollama (pendant embedding) : ~1-1.5GB
- Total pic : ~2GB sur 24GB disponibles

### Phase 1 : Setup base de données

```sql
-- Créer la DB
CREATE DATABASE hexa_vectors;
\c hexa_vectors

-- Activer pgvector
CREATE EXTENSION vector;

-- Table principale
CREATE TABLE chunks (
    id SERIAL PRIMARY KEY,
    source_path TEXT NOT NULL,
    source_type TEXT NOT NULL,  -- 'knowledge', 'glossary', 'skill', 'code', 'doc'
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding vector(768),       -- nomic-embed-text = 768 dimensions
    created_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(source_path, chunk_index)
);

-- Index pour recherche vectorielle (IVFFlat ou HNSW)
CREATE INDEX ON chunks USING hnsw (embedding vector_cosine_ops);

-- Index pour filtrage par type
CREATE INDEX ON chunks (source_type);
```

### Phase 2 : Script d'ingestion

Structure du projet :

```
~/Code/projects/hexa-vector-postgres/
├── package.json
├── tsconfig.json
├── src/
│   ├── config.ts          # Paths, settings
│   ├── scanner.ts         # Trouve les fichiers à indexer
│   ├── chunker.ts         # Découpe en segments
│   ├── embedder.ts        # Appelle Ollama
│   ├── db.ts              # PostgreSQL client
│   ├── ingest.ts          # Orchestrateur ingestion
│   └── search.ts          # CLI de recherche
└── PLAN.md
```

**Dépendances :**

```json
{
  "dependencies": {
    "pg": "^8.11.0",
    "pgvector": "^0.1.8",
    "glob": "^10.3.0",
    "gpt-tokenizer": "^2.1.0"
  }
}
```

### Phase 3 : CLI de recherche

```bash
# Usage prévu
hexa-search "comment fonctionne le chunking"
hexa-search "SX status workflow" --type=code
hexa-search "glossaire distribution" --limit=5
```

### Phase 4 : Intégration Claude Code (optionnel)

Créer un MCP server ou un skill qui :
1. Reçoit une question
2. Fait une recherche vectorielle
3. Retourne le contexte pertinent

---

## Réponse à ta question : Code vs LSP

### Vector Search sur le code

**Avantages :**
- Recherche sémantique : "où gère-t-on les erreurs 401" trouve du code même sans le mot exact
- Cross-file : trouve des patterns similaires à travers le projet
- Découverte : "composants qui font des appels API" sans connaître les noms

**Inconvénients :**
- Pas de navigation symbolique (go-to-definition, find-references)
- Pas de compréhension syntaxique (types, imports, exports)
- Mise à jour au fil des commits nécessite réindexation

### LSP

**Avantages :**
- Précision absolue sur les symboles
- Navigation code → définition → usages
- Temps réel, toujours à jour
- Comprend les types, l'héritage, les imports

**Inconvénients :**
- Requêtes exactes seulement : tu dois connaître le nom
- Pas de recherche sémantique

### Verdict

| Cas d'usage | Meilleur outil |
|-------------|----------------|
| "Où est défini `UserService` ?" | LSP |
| "Trouve les usages de `handleError`" | LSP |
| "Comment on gère l'auth dans le front ?" | Vector Search |
| "Patterns similaires à ce composant" | Vector Search |
| "Que fait le code quand une SX est annulée ?" | Vector Search |

**Conclusion :** Complémentaires. Pour le code, le vector search aide à la découverte, le LSP à la navigation précise.

---

## Estimation ressources

| Métrique | Valeur |
|----------|--------|
| Fichiers à indexer (total) | ~3714 |
| Chunks estimés (~500 tokens/chunk) | ~15K-25K |
| Taille embedding (768 × 4 bytes) | ~3KB/chunk |
| Stockage DB estimé | ~150-300MB |
| Temps ingestion initial | ~30-60 min |
| RAM pic | ~2GB (sur 24GB dispo) |

### Breakdown par groupe

| Groupe | Fichiers | Chunks estimés | Temps ingestion |
|--------|----------|----------------|-----------------|
| Hexactitude (md, sh) | ~1934 | ~8K-12K | ~20-30 min |
| ahs-documentation | 42 | ~200-400 | ~2 min |
| Code Adeo | ~1028 | ~6K-10K | ~15-25 min |

---

## Configuration des sources (config.ts)

```typescript
export const SOURCES = [
  // Groupe 1: Hexactitude
  {
    name: 'hexactitude-docs',
    type: 'knowledge',
    basePath: '~/Hexactitude',
    patterns: ['**/*.md'],
    exclude: ['**/gitignored/**', '**/node_modules/**', '**/cache/**'],
  },
  {
    name: 'hexactitude-scripts',
    type: 'script',
    basePath: '~/Hexactitude/claude/scripts',
    patterns: ['**/*.sh'],
    exclude: [],
  },
  {
    name: 'hexactitude-plugins',
    type: 'plugin',
    basePath: '~/Hexactitude/claude/marketplace/plugins',
    patterns: ['**/*.md', '**/*.ts', '**/manifest.json'],
    exclude: [],
  },

  // Groupe 2: Documentation métier
  {
    name: 'ahs-documentation',
    type: 'glossary',
    basePath: '~/Adeo/ahs-documentation',
    patterns: ['**/*.md'],
    exclude: [],
  },

  // Groupe 3: Code source
  {
    name: 'front',
    type: 'code',
    basePath: '~/Adeo/projects/execution/ahs-operator-execution-frontend/src',
    patterns: ['**/*.ts', '**/*.vue'],
    exclude: ['**/*.spec.ts', '**/*.test.ts'],
  },
  {
    name: 'bff',
    type: 'code',
    basePath: '~/Adeo/projects/execution/ahs-operator-execution-bff/src',
    patterns: ['**/*.ts'],
    exclude: ['**/*.spec.ts', '**/*.test.ts'],
  },
  {
    name: 'contracts',
    type: 'contract',
    basePath: '~/Adeo/projects/execution/_packages/ahs-operator-execution-contracts/src',
    patterns: ['**/*.ts'],
    exclude: [],
  },
];
```

---

## Stratégie de mise à jour incrémentale

```
┌─────────────────────────────────────────────────────────────────┐
│                    SYNC INCRÉMENTALE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Scanner les fichiers avec mtime > dernier sync             │
│  2. Pour chaque fichier modifié:                                │
│     - DELETE FROM chunks WHERE source_path = $path              │
│     - Re-chunker + re-embedder + INSERT                         │
│  3. Fichiers supprimés → DELETE orphelins                       │
│                                                                 │
│  Table de tracking:                                             │
│  CREATE TABLE sync_state (                                      │
│      source_path TEXT PRIMARY KEY,                              │
│      last_mtime TIMESTAMP,                                      │
│      hash TEXT  -- optionnel, pour détecter vrais changements   │
│  );                                                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Usage prévu :**
```bash
hexa-ingest --full          # Première fois / rebuild complet
hexa-ingest --incremental   # Quotidien, ne traite que les modifs
hexa-ingest --source=front  # Re-indexer uniquement le front
```

---

## Prochaines étapes

1. [ ] Valider ce plan
2. [ ] Setup PostgreSQL + pgvector
3. [ ] Setup Ollama + modèle embedding
4. [ ] Créer le projet Node.js
5. [ ] Implémenter scanner → chunker → embedder → db
6. [ ] Implémenter CLI search
7. [ ] Test sur un subset (10 fichiers)
8. [ ] Ingestion complète
9. [ ] Ajouter sync incrémentale
10. [ ] (Optionnel) Intégration MCP/skill Claude Code
