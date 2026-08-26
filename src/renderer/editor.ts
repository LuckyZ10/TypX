import { EditorView, basicSetup } from 'codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

export interface EditorHandle {
  view: EditorView;
  setValue(value: string): void;
  getValue(): string;
  focusAt(offset: number): void;
}

const typxMarkdownHighlight = HighlightStyle.define([
  { tag: tags.heading, color: '#1658b8', fontWeight: '650' },
  { tag: tags.strong, color: '#22221f', fontWeight: '700' },
  { tag: tags.emphasis, color: '#53677f', fontStyle: 'italic' },
  { tag: [tags.link, tags.url], color: '#1859b4', textDecoration: 'none' },
  { tag: tags.quote, color: '#66665f' },
  { tag: tags.monospace, color: '#8f3f25' },
]);

export function createEditor(
  parent: HTMLElement,
  onDoc: (value: string) => void,
  onScrollRatio: (ratio: number) => void,
  onCursor?: (line: number, column: number) => void,
): EditorHandle {
  const view = new EditorView({
    parent,
    doc: '',
    extensions: [
      basicSetup,
      markdown({ base: markdownLanguage }),
      syntaxHighlighting(typxMarkdownHighlight),
      EditorView.lineWrapping,
      EditorView.theme({
        '&': { height: '100%', fontSize: 'var(--cm-font-size, 15px)', backgroundColor: '#fdfdfc', color: '#252522' },
        '.cm-scroller': {
          fontFamily: "'Cascadia Code', 'JetBrains Mono', 'Microsoft YaHei UI', 'PingFang SC', Consolas, monospace",
          lineHeight: '1.82',
          overflow: 'auto',
          padding: '14px 0 32px',
        },
        '.cm-content': { padding: '0 24px 0 10px', caretColor: '#20201e' },
        '.cm-line': { paddingLeft: '5px' },
        '.cm-gutters': { backgroundColor: '#fdfdfc', color: '#aaa9a2', border: 'none', paddingLeft: '10px' },
        '.cm-activeLine': { backgroundColor: '#f4f4f0' },
        '.cm-activeLineGutter': { backgroundColor: '#f4f4f0', color: '#72726c' },
        '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: '#dce7f8 !important' },
      }),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) onDoc(u.state.doc.toString());
        if ((u.selectionSet || u.docChanged) && onCursor) {
          const head = u.state.selection.main.head;
          const line = u.state.doc.lineAt(head);
          onCursor(line.number, head - line.from + 1);
        }
      }),
    ],
  });

  view.scrollDOM.addEventListener('scroll', () => {
    const el = view.scrollDOM;
    const denom = el.scrollHeight - el.clientHeight;
    onScrollRatio(denom > 1 ? el.scrollTop / denom : 0);
  });

  return {
    view,
    setValue(value: string) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    },
    getValue: () => view.state.doc.toString(),
    focusAt(offset: number) {
      const pos = Math.max(0, Math.min(offset, view.state.doc.length));
      view.dispatch({
        selection: { anchor: pos },
        effects: EditorView.scrollIntoView(pos, { y: 'center' }),
      });
      view.focus();
    },
  };
}
