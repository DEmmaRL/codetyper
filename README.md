# CodeTyper

MonkeyType for competitive programming templates. Practice typing C++ algorithms until they're muscle memory.

## How it works

1. Run **CodeTyper: Start** from the command palette
2. Pick a template (e.g. `dijkstra.cpp`, `dsu.cpp`)
3. A blank document opens — start typing the template from memory
4. Ghost text shows what comes next on the current line
5. Tokens are highlighted green (correct) or red (wrong)
6. The status bar shows progress and a preview of the next line

## Tokenization

Comparison is **token-based**, not character-based. This means:

- Spacing differences don't count as errors — `arr[ i ]` and `arr[i]` are identical
- This applies everywhere, including member access: `cin.tie(0)` and `cin . tie( 0 )` are identical
- The template is the source of truth for ambiguous tokens:
  - If the template has `>>`, you must type `>>` (not `> >`)
  - If the template has `> >`, you must type `> >` (not `>>`)
  - Same applies to `<<` vs `< <`
- Comments in templates are ignored and not compared
- Known limitation: spaces inside `#include` header paths (e.g. `<bits/stdc ++.h>`) are not caught as errors — write them exactly as in the template

## Templates

Built-in templates live in the `templates/` folder. You can point CodeTyper at your own folder via settings:

```json
"codetyper.templatesFolder": "/path/to/your/cp-templates"
```

Supported file types: `.cpp`, `.c`, `.py`, `.java`, `.js`, `.ts`, `.go`, `.rs`

## Commands

| Command | Description |
|---|---|
| `CodeTyper: Start` | Pick a template and begin a session |
| `CodeTyper: Stop` | End the current session |
