# Markdown WYSIWYG Editor

Obsidian-style live-preview markdown editor for VS Code. Opens `.md` files with syntax rendered inline — formatting markers appear when your cursor is inside the element and hide when you move away.

![](https://imgur.com/1v8CdQD.gif)

## Features

- **Live preview** — headings, bold, italic, inline code, strikethrough, blockquotes, code blocks, and bullet lists render visually while keeping the raw markdown editable
- **Obsidian-style cursor behaviour** — syntax markers (`#`, `**`, `` ` ``, etc.) reveal themselves when the cursor is inside a formatted element, disappear when it moves out
- **VS Code theme integration** — inherits your editor colors and font
- **GFM support** — GitHub Flavored Markdown (tables, strikethrough, autolinks, task lists)
- Toggle between WYSIWYG and plain-text editor at any time

## Hotkeys

| Hotkey | Description |
|---|---|
| Cmd/Ctrl+Shift+E | Toggle between WYSIWYG and plain-text editor |

## Known limitations

- Links are styled but not clickable (planned)
- Images are hidden, not rendered (planned)
- Tables show as raw markdown, not as rendered HTML tables (planned)
- Strikethrough requires `~~double tildes~~` (GFM standard); single `~tilde~` is not supported

## Development

```bash
npm install
npm run webpack   # build extension + webview bundles
# then F5 in VS Code to launch the extension development host
```
