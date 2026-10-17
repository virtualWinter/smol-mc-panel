import { useState } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material'

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
    if (draft === content || window.confirm('Discard unsaved changes?')) onClose()
  }
  return (
    <Dialog open onClose={close} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontSize: 16, py: 2 }}>{name}{draft !== content ? ' •' : ''}</DialogTitle>
      <DialogContent sx={{ px: 2, pb: 0 }}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField fullWidth multiline minRows={16} maxRows={24} value={draft} onChange={(event) => setDraft(event.target.value)} slotProps={{ htmlInput: { 'aria-label': 'File contents', spellCheck: false } }} sx={{ '& textarea': { fontFamily: 'monospace', fontSize: 13, lineHeight: 1.6 } }} />
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button color="inherit" onClick={close}>Cancel</Button>
        <Button variant="contained" disabled={saving} onClick={async () => { setSaving(true); try { await onSave(draft) } catch (error) { setError(String(error)); setSaving(false) } }}>Save</Button>
      </DialogActions>
    </Dialog>
  )
}
