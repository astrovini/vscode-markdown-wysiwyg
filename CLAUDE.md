# CLAUDE.md

## Build

```bash
npm run webpack   # builds dist/extension.js (node) + dist/codemirror-editor.js (web)
```

F5 in VS Code launches the extension development host with `examples/` as workspace.

## Key files

| File | Role |
|---|---|
| `src/codemirror-editor.js` | Entire webview editor — CodeMirror 6 setup, live-preview decorations, VS Code message handling |
| `src/markdownEditor.ts` | Extension-side host — webview HTML, message handler, prettier formatting |
| `src/extension.ts` | Entry point, commands, keyboard shortcuts |
| `webpack.config.js` | Dual-target build (node + web) |

## Live preview architecture

`buildDecorations(view)` walks the lezer-markdown syntax tree over `view.visibleRanges` and returns `RangeSet.of(ranges, true)`.

- **Block containers** (`ATXHeading`, `FencedCode`, `Blockquote`): `Decoration.line({ class })` per line, then `return` (undefined = still descend into children for marks)
- **Inline containers** (`StrongEmphasis`, `Emphasis`, `InlineCode`, `Strikethrough`, `Link`, `Image`): `Decoration.mark({ class })` over full range, then `return`
- **Mark nodes** (`HeaderMark`, `EmphasisMark`, `CodeMark`, etc.): cursor NOT in parent → `HIDE` (`Decoration.replace({})`); cursor IN parent → `Decoration.mark({ class: 'cm-md-mark' })` (dimmed)

## Critical gotcha — `Decoration.replace({ block: true })`

`to` must be `lastLine.to + 1` (= `nextLine.from`, past the `\n`), **not** `lastLine.to` (which sits ON the `\n`). Wrong boundary corrupts CodeMirror's height calculation and makes all content below the decoration invisible.

```js
const tableTo = tl.to < doc.length ? tl.to + 1 : tl.to;
```

## What's not implemented yet

- **Clickable links** — add `mousedown` handler with Ctrl/Cmd check; post `{ type: 'openLink', url }` to extension; handle with `vscode.env.openExternal` in `markdownEditor.ts`
- **Image rendering** — `ImageWidget` (`Decoration.replace` inline); add `localResourceRoots` to webview options; send `{ type: 'config', docBaseUri }` from extension on `initialized`; use `new URL(relativePath, docBaseUri)` for local paths
- **Table rendering** — `TableWidget` with `Decoration.replace({ block: true })`; apply the `tl.to + 1` boundary rule above
