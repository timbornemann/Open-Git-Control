import React, { useEffect, useRef } from 'react';
import { indentWithTab } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView, highlightTrailingWhitespace, highlightWhitespace, keymap } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { basicSetup } from 'codemirror';

type Props = {
  path: string;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void | Promise<void>;
  showWhitespace?: boolean;
  onSelectionChange?: (selection: { from: number; to: number }) => void;
};

type LanguageDefinition = { label: string; load: () => Promise<Extension> };

const editorTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      backgroundColor: 'var(--bg-main)',
      color: 'var(--text-primary)',
      fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
      fontSize: '13px',
    },
    '.cm-scroller': {
      fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
      lineHeight: '20px',
      overflow: 'auto',
    },
    '.cm-content': {
      caretColor: 'var(--text-primary)',
      padding: '12px 14px',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--bg-dark)',
      borderRight: '1px solid var(--border-color)',
      color: 'var(--text-muted)',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      minWidth: '3.5ch',
      padding: '0 9px 0 8px',
    },
    '.cm-activeLine': {
      backgroundColor: 'var(--bg-hover)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'var(--bg-hover)',
      color: 'var(--text-primary)',
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: 'var(--accent-primary-soft)',
    },
    '&.cm-focused': {
      outline: '1px solid var(--accent-primary-border)',
      outlineOffset: '-1px',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--text-primary)',
    },
  },
  { dark: true },
);

const editorHighlightStyle = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.operatorKeyword], color: 'var(--accent-primary)' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--status-success)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--status-warning)' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: 'var(--text-muted)', fontStyle: 'italic' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--status-info)' },
  { tag: [tags.typeName, tags.className, tags.namespace], color: 'var(--text-accent)' },
  { tag: [tags.propertyName, tags.attributeName], color: 'var(--status-info)' },
  { tag: [tags.tagName], color: 'var(--accent-primary)' },
]);

const javascriptLanguage = (typescript: boolean, jsx: boolean): LanguageDefinition => ({
  label: 'JavaScript / TypeScript',
  load: async () => (await import('@codemirror/lang-javascript')).javascript({ typescript, jsx }),
});

const LANGUAGE_BY_EXTENSION: Record<string, LanguageDefinition> = {
  js: javascriptLanguage(false, false),
  jsx: javascriptLanguage(false, true),
  ts: javascriptLanguage(true, false),
  tsx: javascriptLanguage(true, true),
  html: { label: 'HTML', load: async () => (await import('@codemirror/lang-html')).html() },
  htm: { label: 'HTML', load: async () => (await import('@codemirror/lang-html')).html() },
  css: { label: 'CSS', load: async () => (await import('@codemirror/lang-css')).css() },
  scss: { label: 'CSS', load: async () => (await import('@codemirror/lang-css')).css() },
  sass: { label: 'CSS', load: async () => (await import('@codemirror/lang-css')).css() },
  less: { label: 'CSS', load: async () => (await import('@codemirror/lang-css')).css() },
  json: { label: 'JSON', load: async () => (await import('@codemirror/lang-json')).json() },
  jsonc: { label: 'JSON', load: async () => (await import('@codemirror/lang-json')).json() },
  md: { label: 'Markdown', load: async () => (await import('@codemirror/lang-markdown')).markdown() },
  markdown: { label: 'Markdown', load: async () => (await import('@codemirror/lang-markdown')).markdown() },
  mdown: { label: 'Markdown', load: async () => (await import('@codemirror/lang-markdown')).markdown() },
  mkd: { label: 'Markdown', load: async () => (await import('@codemirror/lang-markdown')).markdown() },
  mkdn: { label: 'Markdown', load: async () => (await import('@codemirror/lang-markdown')).markdown() },
  py: { label: 'Python', load: async () => (await import('@codemirror/lang-python')).python() },
  rs: { label: 'Rust', load: async () => (await import('@codemirror/lang-rust')).rust() },
  java: { label: 'Java', load: async () => (await import('@codemirror/lang-java')).java() },
  c: { label: 'C / C++', load: async () => (await import('@codemirror/lang-cpp')).cpp() },
  cc: { label: 'C / C++', load: async () => (await import('@codemirror/lang-cpp')).cpp() },
  cpp: { label: 'C / C++', load: async () => (await import('@codemirror/lang-cpp')).cpp() },
  cxx: { label: 'C / C++', load: async () => (await import('@codemirror/lang-cpp')).cpp() },
  h: { label: 'C / C++', load: async () => (await import('@codemirror/lang-cpp')).cpp() },
  hpp: { label: 'C / C++', load: async () => (await import('@codemirror/lang-cpp')).cpp() },
  go: { label: 'Go', load: async () => (await import('@codemirror/lang-go')).go() },
  sql: { label: 'SQL', load: async () => (await import('@codemirror/lang-sql')).sql() },
  xml: { label: 'XML', load: async () => (await import('@codemirror/lang-xml')).xml() },
  svg: { label: 'XML', load: async () => (await import('@codemirror/lang-xml')).xml() },
  yaml: { label: 'YAML', load: async () => (await import('@codemirror/lang-yaml')).yaml() },
  yml: { label: 'YAML', load: async () => (await import('@codemirror/lang-yaml')).yaml() },
};

const languageDefinitionForPath = (path: string): LanguageDefinition | null => LANGUAGE_BY_EXTENSION[path.split('.').pop()?.toLowerCase() || ''] || null;

export const getLanguageLabelForPath = (path: string): string | null => languageDefinitionForPath(path)?.label || null;

export const WorkingDirectoryCodeEditor: React.FC<Props> = ({ path, value, onChange, onSave, showWhitespace = false, onSelectionChange }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const languageCompartmentRef = useRef(new Compartment());
  const whitespaceCompartmentRef = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const initialValueRef = useRef(value);
  const initialShowWhitespaceRef = useRef(showWhitespace);
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;
  onSelectionChangeRef.current = onSelectionChange;

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: initialValueRef.current,
        extensions: [
          basicSetup,
          editorTheme,
          syntaxHighlighting(editorHighlightStyle),
          languageCompartmentRef.current.of([]),
          whitespaceCompartmentRef.current.of(initialShowWhitespaceRef.current ? [highlightWhitespace(), highlightTrailingWhitespace()] : []),
          keymap.of([
            indentWithTab,
            {
              key: 'Mod-s',
              run: () => {
                void onSaveRef.current();
                return true;
              },
            },
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
            if (update.selectionSet) {
              const selection = update.state.selection.main;
              onSelectionChangeRef.current?.({ from: selection.from, to: selection.to });
            }
          }),
        ],
      }),
      parent: hostRef.current,
    });
    viewRef.current = view;
    return () => {
      viewRef.current = null;
      view.destroy();
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const definition = languageDefinitionForPath(path);
    let active = true;
    view.dispatch({ effects: languageCompartmentRef.current.reconfigure([]) });
    if (!definition)
      return () => {
        active = false;
      };
    void definition.load().then(
      (extension) => {
        if (active && viewRef.current) viewRef.current.dispatch({ effects: languageCompartmentRef.current.reconfigure(extension) });
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [path]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: whitespaceCompartmentRef.current.reconfigure(showWhitespace ? [highlightWhitespace(), highlightTrailingWhitespace()] : []),
    });
  }, [showWhitespace]);

  return <div ref={hostRef} className="working-file-viewer__code-editor" aria-label={`Code editor for ${path}`} />;
};
