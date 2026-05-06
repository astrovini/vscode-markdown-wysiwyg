# Markdown WYSIWYG Editor

Obsidian-style live-preview markdown editor for VS Code. Opens `.md` files with syntax rendered inline — formatting markers appear when your cursor is inside the element and hide when you move away.

![](https://imgur.com/1v8CdQD.gif)

## Features

- **Live preview** — headings, bold, italic, inline code, strikethrough, blockquotes, code blocks, bullet lists, tables, and images render visually while keeping the raw markdown editable
- **Obsidian-style cursor behaviour** — syntax markers (`#`, `**`, `` ` ``, etc.) reveal themselves when the cursor is inside a formatted element, disappear when it moves out
- **Image rendering** — local (relative path) and remote (`https://`) images render inline; broken images show a styled fallback
- **Clickable links** — Ctrl/Cmd+click opens links in the browser or VS Code
- **VS Code theme integration** — inherits your editor colors and font
- **GFM support** — GitHub Flavored Markdown (tables, strikethrough, autolinks, task lists)
- Toggle between WYSIWYG and plain-text editor at any time

## Hotkeys

| Hotkey | Description |
|---|---|
| Cmd/Ctrl+Shift+E | Toggle between WYSIWYG and plain-text editor |

## Known limitations

- Strikethrough requires `~~double tildes~~` (GFM standard); single `~tilde~` is not supported
- Table click-to-edit is unreliable in some cases — add a blank line after the table as a workaround
- Image paths with `../` (going up directories) are not resolved

## Development

**Prerequisites:** Node.js 18+, VS Code

```bash
git clone https://github.com/astrovini/vscode-markdown-live-editor
cd vscode-markdown-live-editor
npm install
npm run webpack        # builds dist/extension.js and dist/codemirror-editor.js
```

Press **F5** in VS Code to launch the Extension Development Host. Open any `.md` file to test.

## Build and install locally

```bash
npm install
npm run webpack        # development build (source maps included)
npx @vscode/vsce package   # produces markdown-live-editor-<version>.vsix
code --install-extension markdown-live-editor-<version>.vsix
```

Then **Reload Window** (Ctrl+Shift+P → "Reload Window") and open any `.md` file.

## Publish to Marketplace

1. Create a publisher at https://marketplace.visualstudio.com/manage
2. Generate a PAT in Azure DevOps (Marketplace → Manage scope)
3. Run `npx @vscode/vsce publish` and paste the token when prompted
