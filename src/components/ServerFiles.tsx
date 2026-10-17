import { useState } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Paper, Stack, Typography, List, ListItemButton, ListItemIcon, ListItemText } from '@mui/material'
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import { serverFiles } from '../data/mockData'

import type { ServerProps, ServerFile } from '../types'

export default function ServerFiles({ server }: ServerProps) {
  const [selected, setSelected] = useState<ServerFile | null>(null)
  const [contents, setContents] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState('')
  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">servers/{server.id}/</Typography>
      <Paper variant="outlined">
        <List disablePadding>
          {(serverFiles[server.id] ?? []).map((file, index, files) => (
            <ListItemButton key={file.name} divider={index < files.length - 1} sx={{ py: 1.5 }} onClick={() => { setSelected(file); setDraft(contents[file.name] ?? '') }}>
              <ListItemIcon sx={{ minWidth: 40 }}>{file.directory ? <FolderOutlinedIcon /> : <DescriptionOutlinedIcon />}</ListItemIcon>
              <ListItemText primary={file.name} slotProps={{ primary: { variant: 'body2' } }} />
              <Typography variant="body2" color="text.secondary">{file.size}</Typography>
            </ListItemButton>
          ))}
        </List>
      </Paper>
      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} fullWidth maxWidth="md">
        <DialogTitle>{selected?.name}</DialogTitle>
        <DialogContent>
          {selected?.directory ? <Typography color="text.secondary">Empty directory</Typography> : <TextField fullWidth multiline minRows={12} value={draft} onChange={(event) => setDraft(event.target.value)} slotProps={{ htmlInput: { 'aria-label': 'File contents' } }} sx={{ mt: 1, '& textarea': { fontFamily: 'monospace' } }} />}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelected(null)}>Close</Button>
          {selected && !selected.directory && <Button onClick={() => { setContents({ ...contents, [selected.name]: draft }); setSelected(null) }}>Save</Button>}
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
