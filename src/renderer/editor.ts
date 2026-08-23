import { EditorView, basicSetup } from 'codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';

export interface EditorHandle {
  view: EditorView;
  setValue(value: string): void;
  getValue(): string;
}

export function createEditor(
  parent: HTMLElement,
  onDoc: (value: string) => void,
  onScrollRatio: (ratio: number) => void,
): EditorHandle {
  const view = new EditorView({
    parent,
    doc: '',
    extensions: [
      basicSetup,
      markdown({ base: markdownLanguage }),
      EditorView.lineWrapping,
      EditorView.theme({
        '&': { height: '100%', fontSize: 'var(--cm-font-size, 15px)', backgroundColor: '#ffffff' },
        '.cm-scroller': {
          fontFamily: "'Cascadia Code', 'JetBrains Mono', Consolas, 'Courier New', monospace",
          lineHeight: '1.7',
          overflow: 'auto',
        },
        '.cm-gutters': { backgroundColor: '#fafbfc', color: '#b0b7c3', border: 'none' },
        '.cm-activeLine': { backgroundColor: '#f5f8ff' },
        '.cm-activeLineGutter': { backgroundColor: '#eef2f8' },
      }),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) onDoc(u.state.doc.toString());
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
  };
}
