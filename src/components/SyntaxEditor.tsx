import { useMemo } from 'react'
import { useTheme } from '@mui/material'
import CodeMirror, { EditorState, EditorView } from '@uiw/react-codemirror'
import { HighlightStyle, indentUnit, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { editorLanguage } from './editor-languages'

export default function SyntaxEditor({ name, value, onChange, readOnly }: { name: string; value: string; onChange: (value: string) => void; readOnly: boolean }) {
  const theme = useTheme()
  const extensions = useMemo(() => {
    const dark = theme.palette.mode === 'dark'
    return [
      editorLanguage(name),
      EditorState.tabSize.of(2), indentUnit.of('  '), EditorView.lineWrapping,
      EditorView.contentAttributes.of({ 'aria-label': 'File contents', spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off' }),
      syntaxHighlighting(HighlightStyle.define([
        { tag: tags.comment, color: dark ? '#94a3b8' : '#64748b', fontStyle: 'italic' },
        { tag: [tags.propertyName, tags.attributeName, tags.definition(tags.variableName), tags.heading], color: dark ? '#7dd3fc' : '#075985' },
        { tag: [tags.string, tags.special(tags.string), tags.quote], color: dark ? '#86efac' : '#166534' },
        { tag: [tags.number, tags.bool, tags.null], color: dark ? '#fbbf24' : '#92400e' },
        { tag: [tags.keyword, tags.typeName, tags.atom], color: dark ? '#c4b5fd' : '#6d28d9' },
        { tag: [tags.operator, tags.punctuation], color: theme.palette.text.secondary },
        { tag: tags.invalid, color: theme.palette.error.main, textDecoration: 'underline' },
      ])),
      EditorView.theme({
        '&': { backgroundColor: theme.palette.background.default, color: theme.palette.text.primary, border: `1px solid ${theme.palette.divider}`, borderRadius: '6px', overflow: 'hidden' },
        '&.cm-focused': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: '-1px' },
        '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: '13px', lineHeight: '1.6' },
        '.cm-content': { padding: '10px 0', caretColor: theme.palette.text.primary },
        '.cm-gutters': { backgroundColor: theme.palette.background.paper, color: theme.palette.text.secondary, borderRight: `1px solid ${theme.palette.divider}` },
        '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: theme.palette.action.hover },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: theme.palette.action.selected },
        '.cm-cursor, .cm-dropCursor': { borderLeftColor: theme.palette.text.primary },
        '.cm-panels, .cm-tooltip': { backgroundColor: theme.palette.background.paper, color: theme.palette.text.primary, borderColor: theme.palette.divider },
      }, { dark }),
    ]
  }, [name, theme])
  return <CodeMirror value={value} onChange={onChange} readOnly={readOnly} theme="none" extensions={extensions} minHeight="340px" maxHeight="60vh" indentWithTab={false} basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true, bracketMatching: true, searchKeymap: true }} />
}
