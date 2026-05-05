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
	'.cm-scroller': {
		overflow: 'auto',
		padding: '0 42px 40px',
		lineHeight: '1.6',
	},
	'.cm-content': {
		caretColor: 'var(--vscode-editorCursor-foreground)',
		padding: '20px 0',
		maxWidth: '860px',
	},
	'.cm-cursor, .cm-dropCursor': {
		borderLeftColor: 'var(--vscode-editorCursor-foreground)',
	},
	'&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
		backgroundColor: 'var(--vscode-editor-selectionBackground)',
	},
	'&.cm-focused': { outline: 'none' },
	'.cm-line': { padding: '0' },
	// ── Headings ──────────────────────────────────────────────────────────
	'.cm-md-h1': {
		fontSize: '2em',
		fontWeight: 'bold',
		borderBottom: '1px solid var(--vscode-badge-background)',
		lineHeight: '1.4',
		paddingBottom: '2px',
	},
	'.cm-md-h2': { fontSize: '1.5em', fontWeight: 'bold', lineHeight: '1.4' },
	'.cm-md-h3': { fontSize: '1.25em', fontWeight: 'bold' },
	'.cm-md-h4': { fontSize: '1.1em', fontWeight: 'bold' },
	'.cm-md-h5': { fontSize: '1em', fontWeight: 'bold' },
	'.cm-md-h6': { fontSize: '0.85em', fontWeight: 'bold', opacity: '0.7' },
	// ── Syntax marks (dimmed when cursor is inside element) ───────────────
	'.cm-md-mark': { opacity: '0.4' },
	// ── Inline formatting ─────────────────────────────────────────────────
	'.cm-md-strong': { fontWeight: 'bold' },
	'.cm-md-em': { fontStyle: 'italic' },
	'.cm-md-strike': { textDecoration: 'line-through' },
	'.cm-md-code': {
		fontFamily: 'var(--vscode-editor-font-family)',
		color: 'var(--vscode-textPreformat-foreground)',
		backgroundColor: 'var(--vscode-textBlockQuote-background)',
		borderRadius: '3px',
		padding: '1px 4px',
	},
	// ── Code block ────────────────────────────────────────────────────────
	'.cm-md-codeblock': {
		backgroundColor: 'var(--vscode-textCodeBlock-background)',
		fontFamily: 'var(--vscode-editor-font-family)',
		display: 'block',
		padding: '0 16px',
		marginLeft: '14px',
	},
	// ── Blockquote ────────────────────────────────────────────────────────
	'.cm-md-blockquote': {
		borderLeft: '4px solid var(--vscode-badge-background)',
		paddingLeft: '12px',
		opacity: '0.85',
		display: 'block',
	},
	// ── Links ─────────────────────────────────────────────────────────────
	'.cm-md-link': { color: 'var(--vscode-textLink-foreground)' },
	// ── Bullet replacement ────────────────────────────────────────────────
	'.cm-md-bullet': {
		display: 'inline-block',
		width: '1.2em',
		color: 'var(--vscode-editor-foreground)',
	},
	// ── Horizontal rule ───────────────────────────────────────────────────
	'.cm-md-hr': {
		display: 'block',
		borderBottom: '2px solid var(--vscode-badge-background)',
		opacity: '0.5',
	},
});

// ─── Live preview decorations ─────────────────────────────────────────────────

const HIDE = Decoration.replace({});

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
					const line = doc.lineAt(nFrom);
					ranges.push(Decoration.line({ class: 'cm-md-hr' }).range(line.from, line.from));
					return;
				}

				// ── Inline containers ─────────────────────────────────────────
				const INLINE_CLASS = {
					StrongEmphasis: 'cm-md-strong',
					Emphasis: 'cm-md-em',
					InlineCode: 'cm-md-code',
					Strikethrough: 'cm-md-strike',
					Link: 'cm-md-link',
					Image: 'cm-md-link',
				};
				if (INLINE_CLASS[name]) {
					ranges.push(Decoration.mark({ class: INLINE_CLASS[name] }).range(nFrom, nTo));
					return; // descend for mark children
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

// ─── Editor initialisation ────────────────────────────────────────────────────

function init() {
	/* global acquireVsCodeApi */
	const vscode = acquireVsCodeApi();
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
