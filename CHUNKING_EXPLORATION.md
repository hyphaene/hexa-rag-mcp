# Exploration : Améliorer le chunking pour le glossaire

## Problème observé

Le fichier `terms.md` contient des définitions structurées :

```markdown
# Glossary

**SX (Service Execution)**: Une prestation de service planifiée...

**SMA (Service Mobile App)**: AHS mobile application...

**WCF (Work Completion Form)**: Document de fin de travaux...
```

Le chunking actuel (~500 tokens) coupe arbitrairement, séparant potentiellement le terme de sa définition. Résultat : une recherche "C'est quoi une SX ?" ne trouve pas la définition.

## Solutions possibles à explorer

### Option 1 : Chunking par section markdown

**Principe** : Découper sur les headers (`#`, `##`, `###`) plutôt que sur le nombre de tokens.

**Avantages** :

- Respecte la structure sémantique du document
- Un header + son contenu = un chunk cohérent
- Simple à implémenter

**Inconvénients** :

- Chunks de taille très variable (1 ligne vs 2000 lignes)
- Peut créer des chunks trop gros pour l'embedding
- Ne marche pas pour les fichiers sans headers

**Trade-off** : Hybride ? Découper par section, puis re-chunker si > 1000 tokens.

---

### Option 2 : Chunking spécial pour le glossaire

**Principe** : Détecter le pattern `**TERM**: definition` et créer 1 chunk par terme.

**Avantages** :

- Parfait pour les fichiers de glossaire
- Chaque terme est searchable individuellement
- Haute précision

**Inconvénients** :

- Solution spécifique à un format
- Nécessite de détecter le type de fichier
- Ne généralise pas

**Trade-off** : Acceptable si on a peu de types de fichiers structurés.

---

### Option 3 : Augmenter l'overlap entre chunks

**Principe** : Passer de 50 tokens d'overlap à 150-200.

**Avantages** :

- Aucun changement de logique
- Les termes coupés apparaissent dans 2 chunks
- Simple

**Inconvénients** :

- Plus de chunks = plus de stockage
- Plus de duplicatas dans les résultats
- Ne résout pas vraiment le problème structurel

**Trade-off** : Solution de facilité, pas optimale.

---

### Option 4 : Chunks plus petits (~200 tokens)

**Principe** : Réduire la taille des chunks pour plus de granularité.

**Avantages** :

- Plus de précision dans les résultats
- Moins de contexte inutile

**Inconvénients** :

- ~3x plus de chunks (6500 → ~20000)
- Plus de stockage, ingestion plus longue
- Perte de contexte inter-phrases

**Trade-off** : Peut marcher pour la doc, mauvais pour le code.

---

### Option 5 : Chunking sémantique (NLP)

**Principe** : Utiliser un modèle pour détecter les frontières sémantiques.

**Avantages** :

- Chunks vraiment cohérents
- Adaptatif au contenu

**Inconvénients** :

- Complexité++ (besoin d'un modèle de segmentation)
- Latence à l'ingestion
- Overkill pour notre volume

**Trade-off** : Intéressant pour un système de production, overkill ici.

---

### Option 6 : Multi-level indexing

**Principe** : Indexer à plusieurs niveaux (fichier entier + chunks).

**Avantages** :

- Recherche large (fichier) + précise (chunk)
- Fallback si le chunk rate

**Inconvénients** :

- 2x le stockage
- Logique de recherche plus complexe
- Quel niveau retourner ?

**Trade-off** : Intéressant mais complexifie l'usage.

---

### Option 7 : Chunking par type de fichier

**Principe** : Stratégie différente selon le type :

- `glossary` → 1 chunk par terme
- `knowledge` → par section markdown
- `code` → par fonction/classe
- `script` → par fonction shell

**Avantages** :

- Optimisé pour chaque type
- Meilleure pertinence globale

**Inconvénients** :

- Plus de code à maintenir
- Détection du type parfois ambiguë

**Trade-off** : Le plus robuste, mais demande du travail.

---

## Questions à clarifier

1. **Priorité** : Le problème du glossaire est-il critique ou juste "nice to have" ?

2. **Volume** : Est-ce que 3x plus de chunks (option 4) est acceptable ?

3. **Complexité** : Préfères-tu une solution simple (option 3) ou optimale (option 7) ?

4. **Code** : Le chunking du code est-il vraiment utile vs grep/LSP ?

5. **Maintenance** : Qui va maintenir ce système ? (toi seul = keep it simple)

---

## Recommandation

**Court terme** : Option 2 (chunking spécial glossaire) + Option 3 (plus d'overlap)

- Rapide à implémenter
- Résout le problème immédiat
- Peu de risque

**Moyen terme** : Option 7 (chunking par type)

- Plus robuste
- Meilleure qualité globale
- Mais plus de travail

**À éviter** : Option 5 (overkill) et Option 6 (complexité inutile)
