# Prompt d'exécution - ADR-001 Chunking Structure-Aware

```xml
<optimized_prompt>
  <system_context>
    <role>Tu es un développeur TypeScript/Node.js spécialisé en traitement de texte et parsing</role>
    <behavior>
      Implémente directement le code plutôt que de le suggérer.
      Respecte les patterns existants dans le codebase.
      Ajoute des fallbacks pour chaque nouvelle stratégie.
      Compile et vérifie après chaque phase avant de passer à la suivante.
    </behavior>
  </system_context>

  <task>
    <objective>Implémenter un chunking structure-aware avec dispatcher type-specific combinant 4 stratégies : glossary-specific, section-based, AST-based, et default fallback</objective>
    <motivation>Le chunker actuel (~500 tokens, split paragraphes) ignore la structure sémantique, causant des problèmes de pertinence : termes glossaire séparés de leurs définitions, sections markdown coupées arbitrairement, code fragmenté sans respect des frontières logiques</motivation>
  </task>

  <context>
    <cwd>/Users/maximilien/Code/projects/hexa-vector-postgres</cwd>
    <target_files>
      <file purpose="chunker principal à modifier">/Users/maximilien/Code/projects/hexa-vector-postgres/src/chunker.ts</file>
      <file purpose="nouveau fichier pour AST parsing">/Users/maximilien/Code/projects/hexa-vector-postgres/src/ast-chunker.ts</file>
      <file purpose="configuration des types de sources">/Users/maximilien/Code/projects/hexa-vector-postgres/src/config.ts</file>
    </target_files>
    <references>
      <adr purpose="décision architecturale">/Users/maximilien/Code/projects/hexa-vector-postgres/adr/001-chunking-strategy/decision.md</adr>
      <plan purpose="plan détaillé">/Users/maximilien/Code/projects/hexa-vector-postgres/adr/001-chunking-strategy/implementation-plan.md</plan>
    </references>
    <test_files>
      <glossary>/Users/maximilien/Adeo/ahs-documentation/glossary/terms.md</glossary>
      <doc>/Users/maximilien/Adeo/ahs-documentation/requirements/contract/send-contract.md</doc>
    </test_files>
  </context>

  <instructions>
    <phase n="1" name="Glossary-Specific">
      <step n="1.1">Lire src/chunker.ts et src/config.ts pour comprendre la structure actuelle</step>
      <step n="1.2">Créer fonction chunkGlossary(content: string): string[] avec pattern regex /^\*\*([^*]+)\*\*[:\s]*([\s\S]*?)(?=\n\*\*[^*]+\*\*[:\s]|\n#{1,6}\s|$)/gm</step>
      <step n="1.3">Modifier signature chunkContent pour accepter file?: ScannedFile</step>
      <step n="1.4">Ajouter dispatcher: if (file?.sourceType === 'glossary') return chunkGlossary(content)</step>
      <step n="1.5">Mettre à jour chunkFile pour passer le fichier à chunkContent</step>
      <step n="1.6">Compiler avec npm run build et vérifier absence d'erreurs</step>
    </phase>

    <phase n="2" name="Section-Based">
      <step n="2.1">Créer fonction chunkByMarkdownSections(content: string): string[] avec split sur ^#{1,3}\s+.+$</step>
      <step n="2.2">Gérer la recombinaison header + contenu et subdivision si > maxTokens</step>
      <step n="2.3">Étendre dispatcher pour sourceType 'knowledge' et 'doc'</step>
      <step n="2.4">Compiler et vérifier</step>
    </phase>

    <phase n="3" name="AST-Based">
      <step n="3.1">Installer ts-morph: npm install ts-morph</step>
      <step n="3.2">Créer src/ast-chunker.ts avec extraction fonctions/classes/interfaces</step>
      <step n="3.3">Implémenter try/catch avec fallback sur chunker par défaut</step>
      <step n="3.4">Étendre dispatcher pour sourceType 'code' et 'contract'</step>
      <step n="3.5">Compiler et vérifier le build final</step>
    </phase>
  </instructions>

  <constraints>
    <constraint priority="critical">Pas de breaking changes - chunkContent sans paramètre file doit continuer à fonctionner</constraint>
    <constraint priority="critical">Fallback obligatoire sur chunker actuel si erreur de parsing ou pattern non détecté</constraint>
    <constraint priority="high">Seule dépendance externe autorisée: ts-morph pour le parsing TypeScript</constraint>
    <constraint priority="medium">Code simple et lisible - pas d'abstractions prématurées</constraint>
  </constraints>

  <output_format>
    <structure>
      Après chaque phase, afficher:

      ## Phase N terminée

      ### Fichiers modifiés
      - [diff ou contenu des modifications]

      ### Validation
      - Build: ✅/❌
      - Test manuel: [résultat avec fichier de test]

      ---

      Au final, résumer:

      ## Récapitulatif

      | Fichier | Statut |
      |---------|--------|
      | src/chunker.ts | Modifié |
      | src/ast-chunker.ts | Créé |
      | package.json | Modifié (ts-morph) |

      ## Prochaines étapes suggérées
      - [actions post-implémentation]
    </structure>
  </output_format>

  <todo_bootstrap>
    <directive>
      FIRST ACTION before any work: Create a TodoWrite with the following items.
      Mark each item completed as you finish it. Only ONE item should be in_progress at a time.
    </directive>
    <todos>
      [
        {"content": "Lire chunker.ts et config.ts actuels", "status": "in_progress", "activeForm": "Lisant chunker.ts et config.ts"},
        {"content": "Implémenter chunkGlossary", "status": "pending", "activeForm": "Implémentant chunkGlossary"},
        {"content": "Modifier signature chunkContent + dispatcher glossary", "status": "pending", "activeForm": "Modifiant chunkContent pour glossary"},
        {"content": "Build + validation Phase 1", "status": "pending", "activeForm": "Validant Phase 1"},
        {"content": "Implémenter chunkByMarkdownSections", "status": "pending", "activeForm": "Implémentant chunkByMarkdownSections"},
        {"content": "Étendre dispatcher pour knowledge/doc", "status": "pending", "activeForm": "Étendant dispatcher markdown"},
        {"content": "Build + validation Phase 2", "status": "pending", "activeForm": "Validant Phase 2"},
        {"content": "Installer ts-morph", "status": "pending", "activeForm": "Installant ts-morph"},
        {"content": "Créer ast-chunker.ts", "status": "pending", "activeForm": "Créant ast-chunker.ts"},
        {"content": "Étendre dispatcher pour code/contract", "status": "pending", "activeForm": "Étendant dispatcher AST"},
        {"content": "Build + validation finale", "status": "pending", "activeForm": "Validant build final"}
      ]
    </todos>
  </todo_bootstrap>
</optimized_prompt>
```

## Lancement

```bash
# Depuis le répertoire du projet
cd /Users/maximilien/Code/projects/hexa-vector-postgres

# Lancer dans une nouvelle session Claude
cat adr/001-chunking-strategy/execution-prompt.md | pbcopy
# Puis: claude → coller

# Ou directement
claude -p "$(cat adr/001-chunking-strategy/execution-prompt.md)"
```
