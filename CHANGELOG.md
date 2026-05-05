# Changelog

## Unreleased

### Changed
- Replaced CKEditor5 WYSIWYG engine with CodeMirror 6
- Editor is now source-based with live-preview decorations instead of a rich-text model
- Markdown syntax markers reveal themselves when the cursor enters a formatted element (Obsidian-style)

### Added
- Live preview for: headings (h1–h6), bold, italic, inline code, strikethrough (`~~`), fenced code blocks, blockquotes, bullet lists (rendered as `•`), horizontal rules, links
- GFM support via `@lezer/markdown` (tables, strikethrough, task lists, autolinks)
- Bullet list marks replaced with `•` glyph when cursor is not on the line

### Added (latest)
- **Image rendering**: local (relative path) and remote (`https://`) images render as `<img>` widgets via `Decoration.replace` inside `buildDecorations`. Moving the cursor into the image range reveals the raw `![alt](url)` markdown for editing. Broken images show a `[Image: alt]` error fallback. Extension host sends `docBaseUri` (a `vscode-resource:` webview URI for the document's directory) via a `config` message on `initialized`; stored in a `StateEffect`/`StateField` and used by `resolveImageSrc` to rewrite local paths.
- **Clickable links**: Ctrl/Cmd+click opens links in browser (external URLs) or VS Code (relative file paths). URL extracted from lezer AST. Pointer cursor + underline feedback when modifier is held.
- **Table rendering**: GFM tables rendered as styled HTML tables via `StateField` + `Decoration.replace`. Click a row to switch to raw markdown for editing; click outside to render again.

### Known issues / planned
- **Table click-to-edit is unreliable**: CM6 cannot map click coordinates inside a `Decoration.replace` widget to document positions (no rendered text nodes). The widget dispatches the cursor on `mousedown` but focus/selection behaviour is inconsistent. Needs further investigation — possible fix: per-line `Decoration.line` classes instead of a block replace widget (trades visual fidelity for editability).
- Image paths with `../` (going up directories) are not resolved.

---

## 0.7.7

- Improve intellisense
- Fix #10
- Remove TextTransformation plugin
- Hotkeys WIP
