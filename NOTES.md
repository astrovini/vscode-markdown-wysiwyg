# Architecture

## How it works

This is a VS Code [Custom Text Editor](https://code.visualstudio.com/api/extension-guides/custom-editors#custom-text-editor) for `.md` files. The extension registers a `CustomTextEditorProvider` (`MarkdownEditorProvider`) that opens a webview instead of VS Code's default text editor.

The webview runs a self-contained [CodeMirror 6](https://codemirror.net/) editor. The extension host and webview communicate exclusively via `postMessage` — there is no shared memory.

```
VS Code extension host          │  Webview (iframe)
────────────────────────────────┼──────────────────────────────────
markdownEditor.ts               │  codemirror-editor.js
  MarkdownEditorProvider        │    CodeMirror EditorView
  - manages document lifecycle  │    - livePreview ViewPlugin
  - prettier formatting on save │    - tableDecoField StateField
  - postMessage ↔ webview       │    - docBaseUriField StateField
                                │    - linkHandler domEventHandlers
```

## Libraries

| Library | Role |
|---|---|
| [CodeMirror 6](https://codemirror.net/) (`@codemirror/view`, `@codemirror/state`, `@codemirror/language`, `@codemirror/commands`) | Editor engine — input handling, decoration system, state management |
| [`@codemirror/lang-markdown`](https://github.com/codemirror/lang-markdown) | Markdown language support (syntax highlighting, AST integration) |
| [`@lezer/markdown`](https://github.com/lezer-parser/markdown) + `GFM` | Lezer parser for markdown; `GFM` extension adds GitHub Flavored Markdown (tables, strikethrough, task lists) |
| [Prettier](https://prettier.io/) | Auto-formats markdown on save (extension host side only) |
| [Webpack 5](https://webpack.js.org/) | Dual-target build: `node` for the extension host, `web` for the webview bundle |

## Message protocol

| Direction | Type | Payload | When |
|---|---|---|---|
| ext → webview | `documentChanged` | `{ text }` | Document opened or saved |
| ext → webview | `config` | `{ docBaseUri }` | After `initialized` — webview-safe URI for the document's directory |
| ext → webview | `scrollChanged` | `{ scrollTop }` | Text editor scrolls (not yet consumed by webview) |
| webview → ext | `initialized` | — | Webview JS finished loading |
| webview → ext | `webviewChanged` | `{ text }` | User edits content |
| webview → ext | `openLink` | `{ url }` | Ctrl/Cmd+click on a link or image |
| webview → ext | `plainPaste` | — | Plain-text paste shortcut |

## Live preview decoration system

`buildDecorations(view)` in `codemirror-editor.js` walks the lezer syntax tree over `view.visibleRanges` on every `docChanged`, `selectionSet`, or `viewportChanged` event.

**Pattern per node type:**

| Node | Cursor outside | Cursor inside |
|---|---|---|
| `ATXHeading` | `Decoration.line({ class: 'cm-md-hN' })` | same (descend for `HeaderMark`) |
| `FencedCode`, `Blockquote` | `Decoration.line({ class })` per line | same |
| `StrongEmphasis`, `Emphasis`, `InlineCode`, `Strikethrough`, `Link` | `Decoration.mark({ class })` | same (descend for marks) |
| `Image` | `Decoration.replace({ widget: ImageWidget })` | `Decoration.mark({ class: 'cm-md-link' })` + descend |
| `Table` (StateField) | `Decoration.replace({ widget: TableWidget })` | raw (widget suppressed) |
| `HeaderMark`, `EmphasisMark`, etc. | `Decoration.replace({})` (hidden) | `Decoration.mark({ class: 'cm-md-mark' })` (dimmed) |
| `ListMark` (bullet) | `Decoration.replace({ widget: BulletWidget })` | `Decoration.mark({ class: 'cm-md-mark' })` (dimmed) |

Tables use a separate `StateField` (`tableDecoField`) rather than `buildDecorations` because they need to walk the whole document, not just visible ranges.

Images use a `docBaseUriField` StateField (populated via `StateEffect` when the `config` message arrives) to resolve local relative paths to `vscode-resource:` URIs.

---

# Gaps & planned work

## Broken / incomplete

- **Scroll sync to webview** — extension sends `scrollChanged` but `init()` never listens for it; the webview doesn't scroll when the split text editor scrolls
- **Prettier replaces full document on save** — jumps cursor position; should use targeted `WorkspaceEdit` with a diff instead of a full range replace
- **Image `../` paths** — paths going up directories are not resolved; simple path normalization needed

## Missing features (high priority)

- **Task list checkboxes** (`- [ ]` / `- [x]`) — extremely common in Obsidian-style notes; should render as real checkboxes and toggle on click without losing focus
- **Ordered lists** — `1.` items have no visual styling; need indentation and marker styling equivalent to bullet lists
- **Nested list indentation** — no visual hierarchy between list levels regardless of list type

## Missing features (lower priority)

- **YAML front matter** — common in Hugo, Jekyll, Obsidian; currently shows as raw text; should be visually distinguished (dimmed block or hidden)
- **Inline HTML** — `<br>`, `<mark>`, `<kbd>` etc. show as raw text
- **Link hover tooltip** — show URL in a small tooltip on Ctrl/Cmd hover (currently just changes cursor)
- **Document outline / folding** — no structure navigation; `DocumentSymbolProvider` would enable VS Code's outline panel

## Known issues (existing)

- **Table click-to-edit unreliable** — CM6 cannot map click coordinates inside a `Decoration.replace` widget to document positions. The widget dispatches cursor on `mousedown` but focus/selection is inconsistent. Possible fix: per-line `Decoration.line` instead of a block replace widget (trades visual fidelity for editability).
