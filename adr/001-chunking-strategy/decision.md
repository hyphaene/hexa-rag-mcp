# ADR-001: Stratégie de Chunking Structure-Aware

**Date**: 2026-01-02
**Statut**: Accepté
**Décideurs**: @hyphaene

## Contexte

Le système hexa-vector-postgres utilise un chunking naïf (~500 tokens, split sur paragraphes) qui ignore la structure sémantique des documents. Cela cause des problèmes de pertinence :

- Les termes de glossaire sont séparés de leurs définitions
- Les sections markdown sont coupées arbitrairement
- Le code est fragmenté sans respect des frontières logiques (fonctions, classes)

### Exemple concret

Requête : "qu'est-ce qu'un SX ?"

**Avant** : Chunk de 500 tokens contenant "...SX. Created when a customer purchases..." au milieu d'autres définitions.

**Après** : Chunk atomique "**SX (Service Execution)**: A service delivery unit representing work to be performed for a customer..."

## Décision

Implémenter un **chunking structure-aware** via un dispatcher type-specific combinant 4 stratégies :

| Stratégie                    | Types de fichiers  | Principe                       |
| ---------------------------- | ------------------ | ------------------------------ |
| Section-based (1)            | `knowledge`, `doc` | Découpage sur headers markdown |
| Glossary-specific (2)        | `glossary`         | Pattern `**TERM**: definition` |
| Type-specific dispatcher (5) | tous               | Architecture extensible        |
| AST-based (8)                | `code`, `contract` | Extraction fonctions/classes   |

### Stratégies rejetées

| Stratégie                | Raison du rejet                                   |
| ------------------------ | ------------------------------------------------- |
| Increased overlap (3)    | Redondant avec chunking structurel                |
| Smaller chunks (4)       | Contre-productif sans structure                   |
| Multi-level indexing (6) | Complexité excessive (double index, double query) |
| Semantic NLP (7)         | Viole contraintes (local, RAM, simplicité)        |

## Conséquences

### Positives

- Pertinence accrue des résultats de recherche
- Termes métier correctement indexés
- Architecture extensible pour futurs types

### Négatives

- Volume de chunks augmenté (~+50% pour glossaires et docs)
- Temps d'implémentation : ~1 journée
- Parser AST = dépendance supplémentaire (ts-morph)

### Risques

- Fichiers malformés (markdown invalide, code non parsable) → fallback sur chunker actuel
- Régression possible → nécessite jeu de tests de pertinence

## Implémentation

Voir `implementation-plan.md` dans ce dossier.
