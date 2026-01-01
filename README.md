# Hexa Vector Postgres

Système de recherche sémantique local pour Hexactitude, avec RAG optionnel.

## Ce qu'on a mis en place

### Stack technique

| Composant        | Rôle                          | Version         |
| ---------------- | ----------------------------- | --------------- |
| PostgreSQL 16    | Base de données               | brew            |
| pgvector         | Extension vectors pour PG     | 0.8.1 (compilé) |
| Ollama           | Runtime LLM local             | brew            |
| nomic-embed-text | Modèle d'embeddings (768 dim) | ~274MB          |
| mistral          | Modèle LLM pour RAG           | ~4.1GB          |

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    VECTOR SEARCH                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Fichiers ──► Chunker ──► Ollama ──► pgvector ──► Résultats     │
│  (md,ts,sh)   (500 tok)   (embed)    (cosine)                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         RAG                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Question ──► Vector Search ──► Top chunks ──► Mistral ──► Réponse
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Contenu indexé

| Source                                        | Fichiers | Chunks | Type      |
| --------------------------------------------- | -------- | ------ | --------- |
| ~/Hexactitude/\*_/_.md                        | ~1200    | ~4200  | knowledge |
| ~/Hexactitude/claude/scripts/\*_/_.sh         | ~91      | ~300   | script    |
| ~/Hexactitude/claude/marketplace/plugins/\*\* | ~65      | ~325   | plugin    |
| ~/Adeo/ahs-documentation/\*_/_.md             | 42       | ~120   | glossary  |
| front/src/\*_/_.{ts,vue}                      | ~530     | ~800   | code      |
| bff/src/\*_/_.ts                              | ~280     | ~530   | code      |
| contracts/src/\*_/_.ts                        | ~86      | ~170   | contract  |

**Total : ~2300 fichiers, ~6500 chunks**

### Exclusions automatiques

- `**/node_modules/**`
- `**/gitignored/**`
- `**/.git/**`
- `**/dist/**`, `**/build/**`
- `**/cache/**`
- Fichiers > 100KB

## Usage

### Commandes CLI

```bash
# Recherche sémantique
hexa-search "comment gérer les erreurs API"
hexa-search "SX status" --type code -v
hexa-search --stats

# RAG (search + synthèse LLM)
hexa-rag "Quels sont les status possibles d'une SX ?"
hexa-rag "Comment fonctionne la validation budget ?" -l 3

# Ingestion
hexa-ingest                    # Full (première fois)
hexa-ingest --incremental      # Seulement les fichiers modifiés
hexa-ingest --source front     # Une source spécifique
hexa-ingest --limit 10 -v      # Test
```

### Options

| Option          | Description                                                            |
| --------------- | ---------------------------------------------------------------------- |
| `--type TYPE`   | Filtrer par type (knowledge, code, script, plugin, glossary, contract) |
| `-l, --limit N` | Nombre de résultats                                                    |
| `-v, --verbose` | Détails et preview                                                     |
| `--stats`       | Statistiques de la DB                                                  |
| `--incremental` | Ne traiter que les fichiers modifiés                                   |
| `--source NAME` | Filtrer par source                                                     |

## Ce qu'on a testé

### Vector Search

- ✅ Recherche sémantique sur documentation (~70% pertinence)
- ✅ Recherche cross-repo (trouve dans front, bff, glossaire...)
- ⚠️ Recherche sur code : moins pertinent que grep/LSP pour queries exactes
- ✅ Filtrage par type fonctionne
- ✅ Performance : ~80ms total (55ms embed + 20ms search)

### RAG

- ✅ Synthèse de réponses basées sur le contexte
- ✅ Mistral génère des réponses cohérentes en français
- ✅ Sources citées dans l'output
- ⚠️ Latence ~3-5s (acceptable)

### Limites observées

1. **Code** : Le vector search est moins efficace sur le code que sur la doc
   - Les embeddings sont optimisés pour le langage naturel
   - Le chunking casse la structure du code
   - Pour le code : préférer grep/LSP

2. **Scores** : 65-75% max même sur des queries pertinentes
   - C'est normal pour des embeddings locaux
   - Les résultats restent triés correctement

3. **Duplicatas** : Les worktrees créent des duplicatas dans les résultats

## Ressources utilisées

| Ressource      | Utilisation                      |
| -------------- | -------------------------------- |
| RAM (idle)     | ~100MB (PostgreSQL)              |
| RAM (search)   | ~1.5GB (Ollama charge le modèle) |
| RAM (RAG)      | ~5GB (Mistral + embedding)       |
| Disque DB      | ~150MB                           |
| Disque modèles | ~4.5GB (nomic + mistral)         |

## Procédure de désinstallation

### 1. Arrêter les services

```bash
brew services stop postgresql@16
brew services stop ollama
```

### 2. Supprimer la base de données

```bash
/opt/homebrew/opt/postgresql@16/bin/dropdb hexa_vectors
```

### 3. Supprimer les modèles Ollama

```bash
ollama rm nomic-embed-text
ollama rm mistral
```

### 4. Désinstaller les packages (optionnel)

```bash
# Si tu veux garder PostgreSQL/Ollama pour autre chose, skip cette étape
brew uninstall ollama
brew uninstall postgresql@16
brew uninstall pgvector
```

### 5. Supprimer les données PostgreSQL (optionnel)

```bash
rm -rf /opt/homebrew/var/postgresql@16
```

### 6. Supprimer le projet

```bash
rm -rf ~/Code/projects/hexa-vector-postgres
```

### 7. Nettoyer les alias

Éditer `~/.zshrc` et supprimer :

```bash
# Hexa Vector Search
alias hexa-search="cd ~/Code/projects/hexa-vector-postgres && npx tsx src/search.ts"
alias hexa-ingest="cd ~/Code/projects/hexa-vector-postgres && npx tsx src/ingest.ts"
alias hexa-rag="cd ~/Code/projects/hexa-vector-postgres && npx tsx src/rag.ts"
```

### 8. Nettoyer le PATH (si modifié)

Supprimer de `~/.zshrc` :

```bash
export PATH="$HOME/Hexactitude/bin/hexa-vector:$PATH"
```

Puis :

```bash
rm -rf ~/Hexactitude/bin/hexa-vector
```

## Structure du projet

```
~/Code/projects/hexa-vector-postgres/
├── src/
│   ├── config.ts      # Sources à indexer
│   ├── scanner.ts     # Trouve les fichiers
│   ├── chunker.ts     # Découpe en segments (~500 tokens)
│   ├── embedder.ts    # Appelle Ollama nomic-embed-text
│   ├── db.ts          # PostgreSQL + pgvector
│   ├── ingest.ts      # CLI ingestion
│   ├── search.ts      # CLI recherche
│   └── rag.ts         # CLI RAG (search + Mistral)
├── package.json
├── tsconfig.json
├── PLAN.md            # Plan initial
└── README.md          # Cette doc
```

## Maintenance

### Réindexer après modifications

```bash
hexa-ingest --incremental
```

### Vérifier l'état

```bash
hexa-search --stats
brew services list | grep -E "postgresql|ollama"
```

### Logs d'ingestion

```bash
tail -f ~/Code/projects/hexa-vector-postgres/ingest.log
```
