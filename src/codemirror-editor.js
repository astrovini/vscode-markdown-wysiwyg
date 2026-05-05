import { EditorView, ViewPlugin, Decoration, WidgetType, keymap, drawSelection } from '@codemirror/view';
import { EditorState, RangeSet } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { syntaxTree } from '@codemirror/language';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';

// ─── Theme ────────────────────────────────────────────────────────────────────

const vsCodeTheme = EditorView.theme({
	'&': {
		height: '100%',
		backgroundColor: 'var(--vscode-editor-background)',
		color: 'var(--vscode-editor-foreground)',
		fontFamily: 'var(--vscode-editor-font-family)',
		fontSize: 'var(--vscode-editor-font-size)',
	},
	'.cm-scroller': { overflow: 'auto', padding: '0 42px 40px', lineHeight: '1.6' },
	'.cm-content': {
		caretColor: 'var(--vscode-editorCursor-foreground)',
		padding: '20px 0',
		maxWidth: '860px',
	},
	'.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--vscode-editorCursor-foreground)' },
	'&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
		backgroundColor: 'var(--vscode-editor-selectionBackground)',
	},
	'&.cm-focused': { outline: 'none' },
	'.cm-line': { padding: '0' },
	// Headings
	'.cm-md-h1': {
		fontSize: '2em', fontWeight: 'bold', lineHeight: '1.4',
		borderBottom: '1px solid var(--vscode-badge-background)', paddingBottom: '2px',
	},
	'.cm-md-h2': { fontSize: '1.5em', fontWeight: 'bold', lineHeight: '1.4' },
	'.cm-md-h3': { fontSize: '1.25em', fontWeight: 'bold' },
	'.cm-md-h4': { fontSize: '1.1em', fontWeight: 'bold' },
	'.cm-md-h5': { fontSize: '1em', fontWeight: 'bold' },
	'.cm-md-h6': { fontSize: '0.85em', fontWeight: 'bold', opacity: '0.7' },
	// Marks shown when cursor is inside element
	'.cm-md-mark': { opacity: '0.4' },
	// Inline
	'.cm-md-strong': { fontWeight: 'bold' },
	'.cm-md-em': { fontStyle: 'italic' },
	'.cm-md-strike': { textDecoration: 'line-through' },
	'.cm-md-code': {
		fontFamily: 'var(--vscode-editor-font-family)',
		color: 'var(--vscode-textPreformat-foreground)',
		backgroundColor: 'var(--vscode-textBlockQuote-background)',
		borderRadius: '3px', padding: '1px 4px',
	},
	// Code block
	'.cm-md-codeblock': {
		backgroundColor: 'var(--vscode-textCodeBlock-background)',
		fontFamily: 'var(--vscode-editor-font-family)',
		display: 'block', padding: '0 16px', marginLeft: '14px',
	},
	// Blockquote
	'.cm-md-blockquote': {
		borderLeft: '4px solid var(--vscode-badge-background)',
		paddingLeft: '12px', opacity: '0.85', display: 'block',
	},
	// Links / images
	'.cm-md-link': { color: 'var(--vscode-textLink-foreground)' },
	'.cm-md-image': { maxWidth: '100%', display: 'block', margin: '4px 0' },
	// Bullet replacement
	'.cm-md-bullet': { display: 'inline-block', width: '1.2em' },
	// Horizontal rule
	'.cm-md-hr': {
		display: 'block',
		borderBottom: '2px solid var(--vscode-badge-background)',
		opacity: '0.5',
	},
	// Table widget
	'.cm-md-table-wrap': { overflowX: 'auto', margin: '4px 0 8px' },
	'.cm-md-table': { borderCollapse: 'collapse', minWidth: '50%' },
	'.cm-md-table th, .cm-md-table td': {
		border: '1px solid var(--vscode-badge-background)',
		padding: '4px 12px', textAlign: 'left',
	},
	'.cm-md-table th': {
		backgroundColor: 'var(--vscode-editorWidget-background)',
		fontWeight: 'bold',
	},
});

// ─── Widgets ──────────────────────────────────────────────────────────────────

class BulletWidget extends WidgetType {
	toDOM() {
		const s = document.createElement('span');
		s.textContent = '•';
		s.className = 'cm-md-bullet';
		s.setAttribute('aria-hidden', 'true');
		return s;
	}
}

class ImageWidget extends WidgetType {
	constructor(url, alt) {
		super();
		this.url = url;
		this.alt = alt;
	}
	resolvedSrc() {
		const url = this.url;
		if (/^https?:|^data:|^blob:/.test(url)) return url;
		const base = window._docBaseUri;
		if (base) {
			try { return new URL(url, base).toString(); } catch (_) {}
		}
		return url;
	}
	toDOM() {
		const img = document.createElement('img');
		img.src = this.resolvedSrc();
		img.alt = this.alt;
		img.className = 'cm-md-image';
		img.onerror = () => { img.style.display = 'none'; };
		return img;
	}
	eq(other) { return other instanceof ImageWidget && other.url === this.url && other.alt === this.alt; }
	ignoreEvent() { return false; }
}

class TableWidget extends WidgetType {
	constructor(text) {
		super();
		this.text = text;
	}
	toDOM() {
		const wrap = document.createElement('div');
		wrap.className = 'cm-md-table-wrap';
		const tbl = document.createElement('table');
		tbl.className = 'cm-md-table';

		const lines = this.text.split('\n').map(l => l.trim()).filter(Boolean);
		let headerDone = false;

		for (const line of lines) {
			// skip delimiter row (only |, -, :, spaces)
			if (/^[\|:\-\s]+$/.test(line)) { headerDone = true; continue; }

			const row = document.createElement('tr');
			const isHeader = !headerDone;
			const parts = line.split('|');
			// strip empty first/last cells from leading/trailing |
			const cells = parts.slice(
				parts[0].trim() === '' ? 1 : 0,
				parts[parts.length - 1].trim() === '' ? parts.length - 1 : undefined
			);
			for (const cell of cells) {
				const td = document.createElement(isHeader ? 'th' : 'td');
				td.textContent = cell.trim();
				row.appendChild(td);
			}
			tbl.appendChild(row);
		}

		wrap.appendChild(tbl);
		return wrap;
	}
	eq(other) { return other instanceof TableWidget && other.text === this.text; }
	ignoreEvent() { return false; }
}

// ─── Live preview decorations ─────────────────────────────────────────────────

const HIDE = Decoration.replace({});
const BULLET_DECO = Decoration.replace({ widget: new BulletWidget() });

function buildDecorations(view) {
	const ranges = [];
	const sel = view.state.selection.main;
	const doc = view.state.doc;

	function inRange(from, to) { return sel.from <= to && sel.to >= from; }

	function hideOrDim(nFrom, nTo, parent) {
		if (!parent || !inRange(parent.from, parent.to)) {
			ranges.push(HIDE.range(nFrom, nTo));
		} else {
			ranges.push(Decoration.mark({ class: 'cm-md-mark' }).range(nFrom, nTo));
		}
	}

	function addLineDecos(from, to, cls) {
		const startL = doc.lineAt(from).number;
		const endL = doc.lineAt(Math.max(from, to - 1)).number;
		for (let l = startL; l <= endL; l++) {
			const line = doc.line(l);
			ranges.push(Decoration.line({ class: cls }).range(line.from, line.from));
		}
	}

	for (const { from, to } of view.visibleRanges) {
		syntaxTree(view.state).iterate({
			from,
			to,
			enter(node) {
				const { name, from: nFrom, to: nTo } = node;
				const parent = node.node.parent;

				// ── Table (block widget when cursor outside) ─────────────────
				if (name === 'Table') {
					if (!inRange(nFrom, nTo)) {
						const fl = doc.lineAt(nFrom);
						const tl = doc.lineAt(Math.max(nFrom, nTo - 1));
						// block:true requires 'to' at nextLine.from (= tl.to + 1, past the \n)
						const tableFrom = fl.from;
						const tableTo = tl.to < doc.length ? tl.to + 1 : tl.to;
						const tableText = doc.sliceString(tableFrom, tl.to);
						ranges.push(
							Decoration.replace({ widget: new TableWidget(tableText), block: true })
								.range(tableFrom, tableTo)
						);
					}
					return false; // don't process children either way
				}

				// ── Image (replace with <img> when cursor outside) ───────────
				if (name === 'Image') {
					if (!inRange(nFrom, nTo)) {
						let urlStr = '';
						let c = node.node.firstChild;
						while (c) { if (c.name === 'URL') { urlStr = doc.sliceString(c.from, c.to); break; } c = c.nextSibling; }
						const raw = doc.sliceString(nFrom, nTo);
						const altMatch = raw.match(/^!\[([^\]]*)\]/);
						const alt = altMatch ? altMatch[1] : '';
						if (urlStr) {
							ranges.push(Decoration.replace({ widget: new ImageWidget(urlStr, alt) }).range(nFrom, nTo));
							return false;
						}
					}
					ranges.push(Decoration.mark({ class: 'cm-md-link' }).range(nFrom, nTo));
					return; // descend so children get mark/hide treatment
				}

				// ── Block containers: line decorations ───────────────────────
				if (name.startsWith('ATXHeading')) {
					const level = name.slice(-1);
					const line = doc.lineAt(nFrom);
					ranges.push(Decoration.line({ class: `cm-md-h${level}` }).range(line.from, line.from));
					return;
				}
				if (name === 'Blockquote') { addLineDecos(nFrom, nTo, 'cm-md-blockquote'); return; }
				if (name === 'FencedCode') { addLineDecos(nFrom, nTo, 'cm-md-codeblock'); return; }
				if (name === 'HorizontalRule') {
					const line = doc.lineAt(nFrom);
					ranges.push(Decoration.line({ class: 'cm-md-hr' }).range(line.from, line.from));
					return;
				}

				// ── Inline containers: range mark decorations ────────────────
				const INLINE = {
					StrongEmphasis: 'cm-md-strong',
					Emphasis: 'cm-md-em',
					InlineCode: 'cm-md-code',
					Strikethrough: 'cm-md-strike',
					Link: 'cm-md-link',
				};
				if (INLINE[name]) {
					ranges.push(Decoration.mark({ class: INLINE[name] }).range(nFrom, nTo));
					return;
				}

				// ── Marks: hide or dim ────────────────────────────────────────
				if (name === 'HeaderMark') {
					const curIn = parent ? inRange(parent.from, parent.to) : true;
					if (!curIn) {
						const end = nTo < doc.length && doc.sliceString(nTo, nTo + 1) === ' ' ? nTo + 1 : nTo;
						ranges.push(HIDE.range(nFrom, end));
					} else {
						ranges.push(Decoration.mark({ class: 'cm-md-mark' }).range(nFrom, nTo));
					}
				}

				if (name === 'QuoteMark') {
					const curIn = parent ? inRange(parent.from, parent.to) : true;
					if (!curIn) {
						const end = nTo < doc.length && doc.sliceString(nTo, nTo + 1) === ' ' ? nTo + 1 : nTo;
						ranges.push(HIDE.range(nFrom, end));
					} else {
						ranges.push(Decoration.mark({ class: 'cm-md-mark' }).range(nFrom, nTo));
					}
				}

				if (name === 'ListMark') {
					const mark = doc.sliceString(nFrom, nTo);
					const isBullet = mark === '-' || mark === '*' || mark === '+';
					const curIn = parent ? inRange(parent.from, parent.to) : true;
					if (isBullet) {
						if (!curIn) {
							const end = nTo < doc.length && doc.sliceString(nTo, nTo + 1) === ' ' ? nTo + 1 : nTo;
							ranges.push(BULLET_DECO.range(nFrom, end));
						} else {
							ranges.push(Decoration.mark({ class: 'cm-md-mark' }).range(nFrom, nTo));
						}
					}
				}

				if (name === 'EmphasisMark') hideOrDim(nFrom, nTo, parent);
				if (name === 'CodeMark') hideOrDim(nFrom, nTo, parent);
				if (name === 'StrikethroughMark') hideOrDim(nFrom, nTo, parent);
				if (name === 'CodeInfo') hideOrDim(nFrom, nTo, parent);
				if (name === 'LinkMark') hideOrDim(nFrom, nTo, parent);
				if (name === 'URL') hideOrDim(nFrom, nTo, parent);
				if (name === 'LinkTitle') hideOrDim(nFrom, nTo, parent);
			},
		});
	}

	try { return RangeSet.of(ranges, true); }
	catch (e) { console.error('[md-editor] decoration error:', e); return Decoration.none; }
}

const livePreview = ViewPlugin.fromClass(
	class {
		constructor(view) { this.decorations = buildDecorations(view); }
		update(u) {
			if (u.docChanged || u.selectionSet || u.viewportChanged) {
				this.decorations = buildDecorations(u.view);
			}
		}
	},
	{ decorations: (v) => v.decorations }
);

// ─── Link click handler ───────────────────────────────────────────────────────

function getLinkUrl(view, pos) {
	let url = null;
	let cur = syntaxTree(view.state).resolve(pos, -1);
	while (cur) {
		if (cur.name === 'Link' || cur.name === 'Image') {
			let child = cur.firstChild;
			while (child) {
				if (child.name === 'URL') { url = view.state.doc.sliceString(child.from, child.to); break; }
				child = child.nextSibling;
			}
			break;
		}
		cur = cur.parent;
	}
	return url;
}

const linkClickHandler = EditorView.domEventHandlers({
	mousedown(event, view) {
		if (!event.ctrlKey && !event.metaKey) return false;
		const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
		if (pos == null) return false;
		const url = getLinkUrl(view, pos);
		if (url) {
			event.preventDefault();
			window._vscode?.postMessage({ type: 'openLink', url });
			return true;
		}
		return false;
	},
});

// ─── Initialisation ───────────────────────────────────────────────────────────

function init() {
	/* global acquireVsCodeApi */
	const vscode = acquireVsCodeApi();
	window._vscode = vscode;
	let suppressChange = false;

	const view = new EditorView({
		state: EditorState.create({
			doc: '',
			extensions: [
				history(),
				drawSelection(),
				keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
				markdown({ extensions: GFM }),
				livePreview,
				linkClickHandler,
				vsCodeTheme,
				EditorView.lineWrapping,
				EditorView.updateListener.of((update) => {
					if (update.docChanged && !suppressChange) {
						vscode.postMessage({ type: 'webviewChanged', text: view.state.doc.toString() });
					}
				}),
			],
		}),
		parent: document.getElementById('editor'),
	});

	view.focus();

	window.addEventListener('message', (event) => {
		const msg = event.data;
		switch (msg.type) {
			case 'config':
				// Base URI for resolving local image paths
				window._docBaseUri = msg.docBaseUri;
				break;
			case 'documentChanged': {
				const current = view.state.doc.toString();
				if (msg.text !== current) {
					suppressChange = true;
					view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: msg.text } });
					suppressChange = false;
				}
				vscode.setState({ text: msg.text });
				break;
			}
		}
	});

	// Restore state after webview reload
	const saved = vscode.getState();
	if (saved?.text) {
		suppressChange = true;
		view.dispatch({ changes: { from: 0, to: 0, insert: saved.text } });
		suppressChange = false;
	}

	vscode.postMessage({ type: 'initialized' });
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', init);
} else {
	init();
}
