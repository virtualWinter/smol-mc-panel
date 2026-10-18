import { lazy, Suspense, useState } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material'

const SyntaxEditor = lazy(() => import('./SyntaxEditor'))

interface FileEditorProps {
  name: string
  content: string
  onClose: () => void
  onSave: (content: string) => void | Promise<void>
}

export default function FileEditor({ name, content, onClose, onSave }: FileEditorProps) {
  const [draft, setDraft] = useState(content)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const close = () => {
    if (saving) return
    if (draft === content || window.confirm('Discard unsaved changes?')) onClose()
  }
  return (
    <Dialog open onClose={close} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontSize: 16, py: 2 }}>{name}{draft !== content ? ' •' : ''}</DialogTitle>
      <DialogContent sx={{ px: 2, pb: 0 }}>
        {error && <Alert severity="error">{error}</Alert>}
        <Suspense fallback={<TextField fullWidth multiline minRows={16} maxRows={24} value={draft} disabled={saving} onChange={(event) => setDraft(event.target.value)} slotProps={{ htmlInput: { 'aria-label': 'File contents', spellCheck: false } }} sx={{ '& textarea': { fontFamily: 'monospace', fontSize: 13, lineHeight: 1.6 } }} />}>
          <SyntaxEditor name={name} value={draft} onChange={setDraft} readOnly={saving} />
        </Suspense>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button color="inherit" disabled={saving} onClick={close}>Cancel</Button>
        <Button variant="contained" disabled={saving} onClick={async () => { setSaving(true); try { await onSave(draft) } catch (error) { setError(String(error)); setSaving(false) } }}>Save</Button>
      </DialogActions>
    </Dialog>
  )
}
