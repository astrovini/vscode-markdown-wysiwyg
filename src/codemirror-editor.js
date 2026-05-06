import inter400 from '@fontsource/inter/files/inter-latin-400-normal.woff2';
import inter500 from '@fontsource/inter/files/inter-latin-500-normal.woff2';
import inter600 from '@fontsource/inter/files/inter-latin-600-normal.woff2';
import inter700 from '@fontsource/inter/files/inter-latin-700-normal.woff2';
import { EditorView, ViewPlugin, Decoration, WidgetType, keymap, drawSelection } from '@codemirror/view';
import { EditorState, RangeSet, StateField, StateEffect } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { syntaxTree, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { tags as t } from '@lezer/highlight';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';

// ─── docBaseUri state ─────────────────────────────────────────────────────────

const setDocBaseUriEffect = StateEffect.define();

const docBaseUriField = StateField.define({
	create() { return ''; },
	update(value, tr) {
		for (const e of tr.effects) if (e.is(setDocBaseUriEffect)) return e.value;
		return value;
	},
});

function resolveImageSrc(url, docBaseUri) {
	if (!url) return '';
	if (/^https?:\/\//i.test(url) || /^data:/i.test(url)) return url;
	if (!docBaseUri || url.startsWith('#') || /^mailto:/i.test(url)) return '';
	const base = docBaseUri.endsWith('/') ? docBaseUri : docBaseUri + '/';
	return base + url.replace(/^\.\//, '');
}

let _vscode = null;
let _lastMousePos = null;

// ─── GitHub Theme CSS vars ─────────────────────────────────────────────────────

function injectGitHubThemeVars() {
	const style = document.createElement('style');
	style.textContent = `
		@font-face { font-family: 'Inter'; font-weight: 400; font-style: normal; src: url('${inter400}') format('woff2'); }
		@font-face { font-family: 'Inter'; font-weight: 500; font-style: normal; src: url('${inter500}') format('woff2'); }
		@font-face { font-family: 'Inter'; font-weight: 600; font-style: normal; src: url('${inter600}') format('woff2'); }
		@font-face { font-family: 'Inter'; font-weight: 700; font-style: normal; src: url('${inter700}') format('woff2'); }
		body {
			--gh-bg: #0d1117; --gh-bg-alt: #161b22; --gh-border: #30363d;
			--gh-text: #c9d1d9; --gh-text-muted: #8b949e; --gh-text-faint: #6e7681;
			--gh-heading: #e6edf3;
			--gh-accent: #58a6ff;
			--gh-code-bg: rgba(110,118,129,0.4); --gh-code-block-bg: #161b22;
			--gh-font: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI Variable', system-ui, sans-serif;
			--gh-hl-keyword: #ff7b72;
			--gh-hl-string: #a5d6ff;
			--gh-hl-comment: #8b949e;
			--gh-hl-number: #79c0ff;
			--gh-hl-function: #d2a8ff;
			--gh-hl-type: #ffa657;
			--gh-hl-property: #79c0ff;
			--gh-hl-punctuation: #c9d1d9;
			--gh-hl-variable: #c9d1d9;
		}
		body.vscode-light {
			--gh-bg: #ffffff; --gh-bg-alt: #f6f8fa; --gh-border: #d0d7de;
			--gh-text: #24292f; --gh-text-muted: #57606a; --gh-text-faint: #6e7781;
			--gh-heading: #1c2128;
			--gh-accent: #0969da;
			--gh-code-bg: rgba(174,184,193,0.2); --gh-code-block-bg: #f6f8fa;
			--gh-hl-keyword: #cf222e;
			--gh-hl-string: #0a3069;
			--gh-hl-comment: #6e7781;
			--gh-hl-number: #0550ae;
			--gh-hl-function: #8250df;
			--gh-hl-type: #953800;
			--gh-hl-property: #0550ae;
			--gh-hl-punctuation: #24292f;
			--gh-hl-variable: #24292f;
		}
	`;
	document.head.appendChild(style);
}

// ─── Theme ────────────────────────────────────────────────────────────────────

const vsCodeTheme = EditorView.theme({
	'&': {
		height: '100%',
		backgroundColor: 'var(--gh-bg)',
		color: 'var(--gh-text)',
		fontFamily: 'var(--gh-font)',
		fontSize: '14px',
		fontFeatureSettings: '"cv05", "cv08"',
	},
	'.cm-scroller': {
		overflow: 'auto',
		padding: '0 42px 40px',
		lineHeight: '1.7',
		letterSpacing: '0.01em',
	},
	'.cm-content': {
		caretColor: 'var(--vscode-editorCursor-foreground)',
		padding: '28px 0',
		maxWidth: '780px',
	},
	'.cm-cursor, .cm-dropCursor': {
		borderLeftColor: 'var(--vscode-editorCursor-foreground)',
	},
	'&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
		backgroundColor: 'var(--vscode-editor-selectionBackground)',
	},
	'&.cm-focused': { outline: 'none' },
	'.cm-line': { padding: '0' },
	// ── Headings — monochromatic, hierarchy via size + weight + tracking ─
	'.cm-md-h1': { fontSize: '2em',    fontWeight: '700', lineHeight: '1.2', letterSpacing: '-0.02em', color: 'var(--gh-heading)', marginTop: '0.1em' },
	'.cm-md-h2': { fontSize: '1.5em',  fontWeight: '600', lineHeight: '1.25', letterSpacing: '-0.015em', color: 'var(--gh-heading)' },
	'.cm-md-h3': { fontSize: '1.25em', fontWeight: '600', lineHeight: '1.3', letterSpacing: '-0.01em',  color: 'var(--gh-heading)' },
	'.cm-md-h4': { fontSize: '1.1em',  fontWeight: '600', lineHeight: '1.4',                            color: 'var(--gh-heading)' },
	'.cm-md-h5': { fontSize: '1em',    fontWeight: '500', lineHeight: '1.5', letterSpacing: '0.01em',   color: 'var(--gh-text-muted)' },
	'.cm-md-h6': { fontSize: '0.9em',  fontWeight: '500', lineHeight: '1.5', letterSpacing: '0.03em',   color: 'var(--gh-text-faint)', textTransform: 'uppercase' },
	// ── Syntax marks (dimmed when cursor is inside element) ───────────────
	'.cm-md-mark': { opacity: '0.4' },
	// ── Inline formatting ─────────────────────────────────────────────────
	'.cm-md-strong': { fontWeight: 'bold' },
	'.cm-md-em': { fontStyle: 'italic' },
	'.cm-md-strike': { textDecoration: 'line-through' },
	'.cm-md-code': {
		fontFamily: 'var(--vscode-editor-font-family)',
		color: 'var(--gh-text)',
		backgroundColor: 'var(--gh-code-bg)',
		borderRadius: '6px',
		padding: '0.2em 0.4em',
	},
	// ── Code block ────────────────────────────────────────────────────────
	'.cm-md-codeblock': {
		backgroundColor: 'var(--gh-code-block-bg)',
		fontFamily: 'var(--vscode-editor-font-family)',
		display: 'block',
		padding: '0 16px',
		marginLeft: '14px',
	},
	// ── Blockquote ────────────────────────────────────────────────────────
	'.cm-md-blockquote': {
		borderLeft: '0.25em solid var(--gh-accent)',
		paddingLeft: '12px',
		color: 'var(--gh-text-muted)',
		display: 'block',
	},
	// ── Links ─────────────────────────────────────────────────────────────
	'.cm-md-link': { color: 'var(--gh-accent)' },
	'&.cm-link-hover .cm-md-link': { cursor: 'pointer', textDecoration: 'underline' },
	// ── Table ─────────────────────────────────────────────────────────────
	'.cm-md-table': { borderCollapse: 'collapse', width: '100%', marginBottom: '1em' },
	'.cm-md-table th, .cm-md-table td': {
		border: '1px solid var(--gh-border)',
		padding: '6px 13px',
		textAlign: 'left',
	},
	'.cm-md-table th': {
		backgroundColor: 'var(--gh-bg-alt)',
		fontWeight: '600',
	},
	'.cm-md-table tr:nth-child(even) td': {
		backgroundColor: 'var(--gh-bg-alt)',
	},
	// ── Bullet replacement ────────────────────────────────────────────────
	'.cm-md-bullet': {
		display: 'inline-block',
		width: '1.2em',
		color: 'var(--gh-text)',
	},
	// ── Horizontal rule ───────────────────────────────────────────────────
	'.cm-md-hr': {
		border: 'none',
		borderTop: '2px solid var(--gh-border)',
		margin: '0.5em 0',
		opacity: '0.5',
		width: '100%',
	},
	// ── Image ─────────────────────────────────────────────────────────────
	'.cm-md-image img': { maxWidth: '100%', display: 'block', margin: '4px 0' },
	'&.cm-link-hover .cm-md-image': { cursor: 'pointer' },
});

// ─── Syntax highlight style (GitHub-flavored, dark + light) ──────────────────

const githubHighlight = HighlightStyle.define([
	// Keywords: red
	{ tag: [t.keyword, t.operatorKeyword, t.modifier, t.definitionKeyword],
	  color: 'var(--gh-hl-keyword)' },
	// Strings: cyan/teal
	{ tag: [t.string, t.special(t.string), t.regexp],
	  color: 'var(--gh-hl-string)' },
	// Comments: muted
	{ tag: [t.comment, t.lineComment, t.blockComment],
	  color: 'var(--gh-hl-comment)', fontStyle: 'italic' },
	// Numbers, booleans
	{ tag: [t.number, t.bool, t.null],
	  color: 'var(--gh-hl-number)' },
	// Functions / method names
	{ tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName],
	  color: 'var(--gh-hl-function)' },
	// Types, class names
	{ tag: [t.typeName, t.className, t.namespace, t.definition(t.typeName)],
	  color: 'var(--gh-hl-type)' },
	// Properties / attributes
	{ tag: [t.propertyName, t.attributeName],
	  color: 'var(--gh-hl-property)' },
	// Operators, punctuation
	{ tag: [t.operator, t.punctuation, t.separator],
	  color: 'var(--gh-hl-punctuation)' },
	// Tags (HTML/JSX)
	{ tag: [t.tagName, t.angleBracket],
	  color: 'var(--gh-hl-keyword)' },
	// Variable names
	{ tag: [t.variableName, t.definition(t.variableName)],
	  color: 'var(--gh-hl-variable)' },
]);

// ─── Live preview decorations ─────────────────────────────────────────────────

const HIDE = Decoration.replace({});

class HRWidget extends WidgetType {
	toDOM() {
		const hr = document.createElement('hr');
		hr.className = 'cm-md-hr';
		hr.setAttribute('aria-hidden', 'true');
		return hr;
	}
	ignoreEvent() { return false; }
}
const HR = new HRWidget();

class BulletWidget extends WidgetType {
	toDOM() {
		const span = document.createElement('span');
		span.textContent = '•';
		span.className = 'cm-md-bullet';
		span.setAttribute('aria-hidden', 'true');
		return span;
	}
}
const BULLET = new BulletWidget();

function buildDecorations(view) {
	const ranges = [];
	const sel = view.state.selection.main;
	const doc = view.state.doc;

	function cursorInRange(from, to) {
		return sel.from <= to && sel.to >= from;
	}

	function hideOrDim(nFrom, nTo, parent) {
		const inParent = parent ? cursorInRange(parent.from, parent.to) : true;
		if (!inParent) {
			ranges.push(HIDE.range(nFrom, nTo));
		} else {
			ranges.push(Decoration.mark({ class: 'cm-md-mark' }).range(nFrom, nTo));
		}
	}

	function addLineDecos(from, to, cls) {
		const startLine = doc.lineAt(from).number;
		const endLine = doc.lineAt(Math.max(from, to - 1)).number;
		for (let l = startLine; l <= endLine; l++) {
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

				// ── Block containers ─────────────────────────────────────────
				if (name.startsWith('ATXHeading')) {
					const level = name.slice(-1);
					const line = doc.lineAt(nFrom);
					ranges.push(Decoration.line({ class: `cm-md-h${level}` }).range(line.from, line.from));
					return; // descend for HeaderMark child
				}

				if (name === 'Blockquote') {
					addLineDecos(nFrom, nTo, 'cm-md-blockquote');
					return;
				}

				if (name === 'FencedCode') {
					addLineDecos(nFrom, nTo, 'cm-md-codeblock');
					return;
				}

				if (name === 'HorizontalRule') {
					if (cursorInRange(nFrom, nTo)) {
						ranges.push(Decoration.mark({ class: 'cm-md-mark' }).range(nFrom, nTo));
					} else {
						ranges.push(Decoration.replace({ widget: HR }).range(nFrom, nTo));
					}
					return false;
				}

				// ── Inline containers ─────────────────────────────────────────
				const INLINE_CLASS = {
					StrongEmphasis: 'cm-md-strong',
					Emphasis: 'cm-md-em',
					InlineCode: 'cm-md-code',
					Strikethrough: 'cm-md-strike',
					Link: 'cm-md-link',
				};
				if (INLINE_CLASS[name]) {
					ranges.push(Decoration.mark({ class: INLINE_CLASS[name] }).range(nFrom, nTo));
					return; // descend for mark children
				}

				if (name === 'Image') {
					if (cursorInRange(nFrom, nTo)) {
						// cursor inside — show raw markdown with link styling
						ranges.push(Decoration.mark({ class: 'cm-md-link' }).range(nFrom, nTo));
						return; // descend so LinkMark/URL/LinkTitle get dimmed
					}
					// cursor outside — render the image widget
					const docBaseUri = view.state.field(docBaseUriField);
					let url = '', child = node.node.firstChild;
					while (child) {
						if (child.name === 'URL') { url = doc.sliceString(child.from, child.to); break; }
						child = child.nextSibling;
					}
					let altFrom = nFrom + 2, altTo = nFrom + 2, linkMarkCount = 0;
					child = node.node.firstChild;
					while (child) {
						if (child.name === 'LinkMark' && ++linkMarkCount === 2) { altTo = child.from; break; }
						child = child.nextSibling;
					}
					const src = resolveImageSrc(url, docBaseUri);
					if (src) {
						ranges.push(
							Decoration.replace({ widget: new ImageWidget(src, doc.sliceString(altFrom, altTo)) })
								.range(nFrom, nTo)
						);
					} else {
						ranges.push(Decoration.mark({ class: 'cm-md-link' }).range(nFrom, nTo));
					}
					return false; // don't descend — children are inside the replaced range
				}

				// ── Marks ─────────────────────────────────────────────────────
				if (name === 'HeaderMark') {
					const inParent = parent ? cursorInRange(parent.from, parent.to) : true;
					if (!inParent) {
						// hide the # and the space after it
						const end =
							nTo < doc.length && doc.sliceString(nTo, nTo + 1) === ' ' ? nTo + 1 : nTo;
						ranges.push(HIDE.range(nFrom, end));
					} else {
						ranges.push(Decoration.mark({ class: 'cm-md-mark' }).range(nFrom, nTo));
					}
				}

				if (name === 'QuoteMark') {
					const inParent = parent ? cursorInRange(parent.from, parent.to) : true;
					if (!inParent) {
						const end =
							nTo < doc.length && doc.sliceString(nTo, nTo + 1) === ' ' ? nTo + 1 : nTo;
						ranges.push(HIDE.range(nFrom, end));
					} else {
						ranges.push(Decoration.mark({ class: 'cm-md-mark' }).range(nFrom, nTo));
					}
				}

				if (name === 'ListMark') {
					const markText = doc.sliceString(nFrom, nTo);
					const isBullet = markText === '-' || markText === '*' || markText === '+';
					const inParent = parent ? cursorInRange(parent.from, parent.to) : true;
					if (isBullet) {
						if (!inParent) {
							// replace the mark + following space with a bullet glyph
							const end =
								nTo < doc.length && doc.sliceString(nTo, nTo + 1) === ' ' ? nTo + 1 : nTo;
							ranges.push(Decoration.replace({ widget: BULLET }).range(nFrom, end));
						} else {
							ranges.push(Decoration.mark({ class: 'cm-md-mark' }).range(nFrom, nTo));
						}
					}
					// ordered list marks are left visible (just numbers)
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

	return RangeSet.of(ranges, true);
}

const livePreview = ViewPlugin.fromClass(
	class {
		constructor(view) {
			this.decorations = buildDecorations(view);
		}
		update(update) {
			if (update.docChanged || update.selectionSet || update.viewportChanged) {
				this.decorations = buildDecorations(update.view);
			}
		}
	},
	{ decorations: (v) => v.decorations }
);

// ─── Table rendering ─────────────────────────────────────────────────────────

class TableWidget extends WidgetType {
	constructor(markdown, from, rowOffsets) {
		super();
		this.markdown = markdown;
		this.from = from;
		this.rowOffsets = rowOffsets;
	}
	eq(other) { return other.markdown === this.markdown && other.from === this.from; }
	ignoreEvent() { return false; }
	toDOM(view) {
		const rows = this.markdown.trim().split('\n');
		const table = document.createElement('table');
		table.className = 'cm-md-table';
		let rowIdx = 0;
		rows.forEach((row, i) => {
			if (/^[\s|:-]+$/.test(row)) return; // skip separator row
			const cells = row.split('|').map(c => c.trim()).filter((c, idx, arr) =>
				!(idx === 0 && c === '') && !(idx === arr.length - 1 && c === '')
			);
			const tr = document.createElement('tr');
			tr.dataset.pos = String(this.rowOffsets[rowIdx] ?? this.from);
			rowIdx++;
			cells.forEach(text => {
				const td = document.createElement(i === 0 ? 'th' : 'td');
				td.textContent = text;
				tr.appendChild(td);
			});
			table.appendChild(tr);
		});
		const tableFrom = this.from;
		table.addEventListener('mousedown', (e) => {
			let el = e.target;
			while (el && el.tagName !== 'TR') el = el.parentElement;
			const pos = el && el.dataset.pos != null ? Number(el.dataset.pos) : tableFrom;
			e.preventDefault();
			view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
			view.focus();
		});
		return table;
	}
}

function buildTableDecorations(state) {
	const sel = state.selection.main;
	const doc = state.doc;
	const ranges = [];
	const seen = new Set();
	syntaxTree(state).iterate({
		enter(node) {
			if (node.name !== 'Table') return;
			const { from: nFrom, to: nTo } = node;
			if (seen.has(nFrom)) return false;
			seen.add(nFrom);
			const tableFrom = doc.lineAt(nFrom).from;
			const lastLine = doc.lineAt(Math.max(nFrom, nTo - 1));
			const tableTo = lastLine.to;
			if (sel.from <= tableTo && sel.to >= tableFrom) return false; // cursor inside — show raw
			const md = doc.sliceString(tableFrom, tableTo);
			// build per-row document offsets (skip separator row)
			const rowOffsets = [];
			let linePos = tableFrom;
			for (const line of md.split('\n')) {
				if (!/^[\s|:-]+$/.test(line)) rowOffsets.push(linePos);
				linePos += line.length + 1;
			}
			ranges.push(
				Decoration.replace({ widget: new TableWidget(md, tableFrom, rowOffsets) })
					.range(tableFrom, tableTo)
			);
			return false;
		},
	});
	return RangeSet.of(ranges, true);
}

const tableDecoField = StateField.define({
	create(state) { return buildTableDecorations(state); },
	update(decos, tr) {
		if (!tr.docChanged && !tr.selectionSet) return decos.map(tr.changes);
		return buildTableDecorations(tr.state);
	},
	provide: f => EditorView.decorations.from(f),
});

// ─── Image rendering ──────────────────────────────────────────────────────────

class ImageWidget extends WidgetType {
	constructor(src, alt) {
		super();
		this.src = src;
		this.alt = alt;
	}
	eq(other) { return other.src === this.src && other.alt === this.alt; }
	ignoreEvent() { return false; }
	toDOM() {
		const wrap = document.createElement('span');
		wrap.className = 'cm-md-image';
		const img = document.createElement('img');
		img.src = this.src;
		img.alt = this.alt;
		img.addEventListener('error', () => {
			const span = document.createElement('span');
			span.textContent = this.alt ? `[Image: ${this.alt}]` : '[Image]';
			span.style.cssText = 'color:var(--vscode-errorForeground);font-style:italic;opacity:.7';
			wrap.replaceWith(span);
		});
		wrap.appendChild(img);
		return wrap;
	}
}

// ─── Link click handling ──────────────────────────────────────────────────────

function getUrlAtPos(state, pos) {
	let node = syntaxTree(state).resolveInner(pos, 1);
	while (node && node.name !== 'Link' && node.name !== 'Image') {
		node = node.parent;
	}
	if (!node) return null;
	let child = node.firstChild;
	while (child) {
		if (child.name === 'URL') return state.doc.sliceString(child.from, child.to);
		child = child.nextSibling;
	}
	return null;
}

const linkHandler = EditorView.domEventHandlers({
	mousedown(event, view) {
		if (!(event.ctrlKey || event.metaKey) || event.button !== 0) return false;
		const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
		if (pos == null) return false;
		const url = getUrlAtPos(view.state, pos);
		if (!url) return false;
		event.preventDefault();
		_vscode.postMessage({ type: 'openLink', url });
		return true;
	},
	mousemove(event, view) {
		_lastMousePos = { x: event.clientX, y: event.clientY };
		if (!(event.ctrlKey || event.metaKey)) {
			view.dom.classList.remove('cm-link-hover');
			return false;
		}
		const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
		const url = pos != null ? getUrlAtPos(view.state, pos) : null;
		view.dom.classList.toggle('cm-link-hover', url !== null);
		return false;
	},
	keydown(event, view) {
		if ((event.key === 'Control' || event.key === 'Meta') && _lastMousePos) {
			const pos = view.posAtCoords(_lastMousePos);
			const url = pos != null ? getUrlAtPos(view.state, pos) : null;
			view.dom.classList.toggle('cm-link-hover', url !== null);
		}
		return false;
	},
	keyup(event, view) {
		if (event.key === 'Control' || event.key === 'Meta') {
			view.dom.classList.remove('cm-link-hover');
		}
		return false;
	},
});

// ─── Editor initialisation ────────────────────────────────────────────────────

function init() {
	injectGitHubThemeVars();
	/* global acquireVsCodeApi */
	_vscode = acquireVsCodeApi();
	const vscode = _vscode;
	let suppressChange = false;

	const view = new EditorView({
		state: EditorState.create({
			doc: '',
			extensions: [
				history(),
				drawSelection(),
				keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
				markdown({ extensions: GFM, codeLanguages: languages }),
				syntaxHighlighting(githubHighlight),
				livePreview,
				tableDecoField,
				docBaseUriField,
				linkHandler,
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
		const { type, text } = event.data;
		if (type === 'config') {
			view.dispatch({ effects: setDocBaseUriEffect.of(event.data.docBaseUri ?? '') });
			return;
		}
		if (type === 'documentChanged') {
			const current = view.state.doc.toString();
			if (text !== current) {
				suppressChange = true;
				view.dispatch({
					changes: { from: 0, to: view.state.doc.length, insert: text },
				});
				suppressChange = false;
			}
			vscode.setState({ text });
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
