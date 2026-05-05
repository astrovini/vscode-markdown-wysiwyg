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
- **Inline containers** (`StrongEmphasis`, `Emphasis`, `InlineCode`, `Strikethrough`, `Link`): `Decoration.mark({ class })` over full range, then `return`
- **Image**: cursor IN node → `Decoration.mark({ class: 'cm-md-link' })` + descend (raw text, dimmed marks); cursor OUT → `Decoration.replace({ widget: new ImageWidget(src, alt) })` + `return false`
- **Mark nodes** (`HeaderMark`, `EmphasisMark`, `CodeMark`, etc.): cursor NOT in parent → `HIDE` (`Decoration.replace({})`); cursor IN parent → `Decoration.mark({ class: 'cm-md-mark' })` (dimmed)


## Known gotchas

- **Table editing requires an empty line below** — the table `Decoration.replace` widget uses `tableTo = lastLine.to` (end of last line, before `\n`). If there is no blank line after the table, the cursor cannot be placed past `tableTo` and the raw markdown never shows. Workaround: always leave a blank line after a table. Fix: needs a better cursor-detection strategy (see CHANGELOG known issues).

