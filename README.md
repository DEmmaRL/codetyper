# CodeTyper

Practice typing your competitive programming templates and algorithms. The goal is to reduce the friction of copying from a reference sheet during a contest. So when you are copying your template, debug or even a large algorithm implementation, you spend less time transcribing and more time thinking about the actual solution.

> There's no substitute for solving real problems. Typing practice is a complement, not a replacement, the best way to internalize an algorithm is still to use it under contest conditions.

## How it works

1. Run **CodeTyper: Start** from the command palette
2. Pick a template from your folder, or choose **Browse...** to load any file
3. A blank document opens — start typing the template from memory
4. Ghost text shows what comes next on the current line
5. Tokens are highlighted green (correct) or red (wrong)
6. The status bar shows progress, error count, and live WPM
7. On completion, a summary shows total tokens, WPM, errors, and time

## Tokenization

Comparison is **token-based**, not character-based. This means:

- Spacing differences don't count as errors — `arr[ i ]` and `arr[i]` are identical
- This applies everywhere, including member access: `cin.tie(0)` and `cin . tie( 0 )` are identical
- The template is the source of truth for ambiguous tokens:
  - If the template has `>>`, you must type `>>` (not `> >`)
  - If the template has `> >`, you must type `> >` (not `>>`)
  - Same applies to `<<` vs `< <`
- Comments in templates are ignored and not compared
- Preprocessor directives (`#include`, `#define`, etc.) must stay on a single line — splitting them across lines or merging two directives onto one line is an error
- Known limitation: spaces inside `#include` header paths (e.g. `<bits/stdc ++.h>`) are not caught as errors — write them exactly as in the template

## Templates

Built-in templates live in the `templates/` folder (included for demo purposes). Point CodeTyper at your own folder via settings:

```json
"codetyper.templatesFolder": "/path/to/your/cp-templates"
```

Or use **Browse...** in the template picker to load any file directly.

Supported file types: `.cpp`, `.c`, `.py`, `.java`, `.js`, `.ts`, `.go`, `.rs`

> **Note:** The tokenizer is currently optimized for C++ syntax. Other languages can be loaded and practiced, but token comparison may be less accurate. Support for Python and other languages is planned.

## Commands

| Command | Description |
|---|---|
| `CodeTyper: Start` | Pick a template and begin a session |
| `CodeTyper: Restart` | Restart with the same template |
| `CodeTyper: Stop` | End the current session |
| `CodeTyper: Set Templates Folder` | Pick a folder to use as your templates source |
| `CodeTyper: Toggle Blind Mode` | Hide/show ghost text and highlights during a session |
| `CodeTyper: Toggle Preview` | Open/close the template side panel during a session |
| `CodeTyper: History` | View past sessions and replay any of them |

## Settings

| Setting | Default | Description |
|---|---|---|
| `codetyper.defaultMode` | `"ghost"` | Default typing mode: `"ghost"` shows hints, `"blind"` hides them |
| `codetyper.showPreview` | `true` | Show the template in a side panel when a session starts |
| `codetyper.templatesFolder` | `""` | Absolute path to your templates folder |
| `codetyper.maxHistory` | `1000` | Maximum number of session records to keep |
