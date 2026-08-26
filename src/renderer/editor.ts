import { EditorView, basicSetup } from 'codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { linter, type Diagnostic } from '@codemirror/lint';
import { HighlightStyle, syntaxHighlighting, syntaxTree } from '@codemirror/language';
import { Compartment } from '@codemirror/state';
import { tags } from '@lezer/highlight';

export interface EditorHandle {
  view: EditorView;
  setValue(value: string): void;
  getValue(): string;
  focusAt(offset: number, end?: number): void;
  setSyntaxHintsEnabled(enabled: boolean): void;
  getSyntaxWarnings(): Diagnostic[];
}

const typxMarkdownHighlight = HighlightStyle.define([
  { tag: tags.heading, color: '#1658b8', fontWeight: '650' },
  { tag: tags.strong, color: '#22221f', fontWeight: '700' },
  { tag: tags.emphasis, color: '#53677f', fontStyle: 'italic' },
  { tag: [tags.link, tags.url], color: '#1859b4', textDecoration: 'none' },
  { tag: tags.quote, color: '#66665f' },
  { tag: tags.monospace, color: '#8f3f25' },
]);

function markerContext(view: EditorView, pos: number): { ignored: boolean; strong: boolean } {
  let node: ReturnType<ReturnType<typeof syntaxTree>['resolveInner']> | null = syntaxTree(view.state).resolveInner(pos, 1);
  let ignored = false;
  let strong = false;
  while (node) {
    if (/Code|Comment|HTML/i.test(node.name)) ignored = true;
    if (node.name === 'StrongEmphasis') strong = true;
    node = node.parent;
  }
  return { ignored, strong };
}

function isEscaped(text: string, index: number): boolean {
  let slashes = 0;
  for (let pos = index - 1; pos >= 0 && text[pos] === '\\'; pos--) slashes++;
  return slashes % 2 === 1;
}

/**
 * 只提示“源码里出现了 **，但 Markdown 语法树没有把它识别成粗体”的位置。
 * 不修改原文；代码、HTML、转义和 *** 等更复杂的标记不参与判断，减少误报。
 */
function markdownSyntaxWarnings(view: EditorView): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const doc = view.state.doc;
  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber++) {
    const line = doc.line(lineNumber);
    const markers: number[] = [];
    const regex = /\*\*/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line.text))) {
      const local = match.index;
      const from = line.from + local;
      if (isEscaped(line.text, local) || line.text[local - 1] === '*' || line.text[local + 2] === '*') continue;
      const context = markerContext(view, from);
      if (!context.ignored && !context.strong) markers.push(from);
    }

    for (let index = 0; index < markers.length; index += 2) {
      const opening = markers[index];
      const closing = markers[index + 1];
      if (closing === undefined) {
        diagnostics.push({
          from: opening,
          to: opening + 2,
          severity: 'warning',
          source: 'TypX Markdown',
          message: '这个 ** 没有配对形成粗体。如果是有意显示 **，可以忽略此提醒。',
        });
        continue;
      }

      const before = doc.sliceString(Math.max(opening + 2, closing - 1), closing);
      const after = doc.sliceString(closing + 2, Math.min(doc.length, closing + 3));
      const likelyMissingSpace = /[\p{P}\p{S}]/u.test(before) && /[\p{L}\p{N}]/u.test(after);
      diagnostics.push({
        from: closing,
        to: closing + 2,
        severity: 'warning',
        source: 'TypX Markdown',
        message: likelyMissingSpace
          ? '这组 ** 没有形成粗体；结束标记后可能缺少空格。如果是有意显示 **，可以忽略此提醒。'
          : '这组 ** 没有形成粗体，请检查空格或标记位置。如果是有意显示 **，可以忽略此提醒。',
      });
    }
  }
  return diagnostics;
}

export function createEditor(
  parent: HTMLElement,
  onDoc: (value: string) => void,
  onScrollRatio: (ratio: number) => void,
  onCursor?: (line: number, column: number) => void,
  syntaxHintsEnabled = true,
): EditorHandle {
  const syntaxHints = new Compartment();
  const syntaxHintExtension = linter(markdownSyntaxWarnings, { delay: 320 });
  const view = new EditorView({
    parent,
    doc: '',
    extensions: [
      basicSetup,
      markdown({ base: markdownLanguage }),
      syntaxHighlighting(typxMarkdownHighlight),
      syntaxHints.of(syntaxHintsEnabled ? syntaxHintExtension : []),
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
        '.cm-lintRange-warning': {
          backgroundImage: 'none',
          textDecoration: 'underline wavy #d18a24',
          textDecorationThickness: '1px',
          textUnderlineOffset: '3px',
        },
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
    focusAt(offset: number, end = offset) {
      const pos = Math.max(0, Math.min(offset, view.state.doc.length));
      let selectionEnd = Math.max(pos, Math.min(end, view.state.doc.length));
      while (selectionEnd > pos && /\s/.test(view.state.doc.sliceString(selectionEnd - 1, selectionEnd))) selectionEnd--;
      view.dispatch({
        selection: { anchor: pos, head: selectionEnd },
        effects: EditorView.scrollIntoView(pos, { y: 'center' }),
      });
      view.focus();
    },
    setSyntaxHintsEnabled(enabled: boolean) {
      view.dispatch({ effects: syntaxHints.reconfigure(enabled ? syntaxHintExtension : []) });
    },
    getSyntaxWarnings: () => markdownSyntaxWarnings(view),
  };
}
