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

### Known issues / planned
- Links: styled but not yet clickable
- Images: syntax hidden but not rendered as `<img>`
- Tables: parsed but not rendered as HTML tables

---

## 0.7.7

- Improve intellisense
- Fix #10
- Remove TextTransformation plugin
- Hotkeys WIP
