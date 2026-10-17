import { useState } from 'react'
import { Box, Breadcrumbs, Button, InputAdornment, Link, List, ListItemButton, ListItemIcon, ListItemText, Paper, Stack, TextField, Typography } from '@mui/material'
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import SearchIcon from '@mui/icons-material/Search'
import { serverFiles } from '../data/mockData'
import FileEditor from './FileEditor'
import type { ServerProps, ServerFile } from '../types'

function FileManager({ server }: ServerProps) {
  const [selected, setSelected] = useState<ServerFile | null>(null)
  const [contents, setContents] = useState<Record<string, string>>({})
  const [path, setPath] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')
  const files = (path.length ? [] : serverFiles[server.id] ?? [])
    .filter((file) => file.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => Number(Boolean(b.directory)) - Number(Boolean(a.directory)) || a.name.localeCompare(b.name))
  const navigate = (next: string[]) => { setPath(next); setSearch(''); setNotice('') }
  const fileKey = [...path, selected?.name].join('/')

  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
        <Breadcrumbs separator={<ChevronRightIcon fontSize="small" />} aria-label="File path">
          <Link component="button" underline="hover" color={path.length ? 'text.secondary' : 'text.primary'} onClick={() => navigate([])} sx={{ fontSize: 14 }} aria-label="Root directory">/</Link>
          {path.map((part, index) => <Link key={index} component="button" underline="hover" color="text.primary" onClick={() => navigate(path.slice(0, index + 1))} sx={{ fontSize: 14 }}>{part}</Link>)}
        </Breadcrumbs>
        <TextField placeholder="Search files…" value={search} onChange={(event) => setSearch(event.target.value)} sx={{ width: { xs: '100%', sm: 240 } }} slotProps={{ htmlInput: { 'aria-label': 'Search files' }, input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
      </Stack>
      <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
        <Stack direction="row" sx={{ px: 2, py: 1, bgcolor: 'action.hover', justifyContent: 'space-between' }}>
          <Typography variant="caption" color="text.secondary">Name</Typography>
          <Typography variant="caption" color="text.secondary">Size</Typography>
        </Stack>
        <List disablePadding>
          {path.length > 0 && <ListItemButton onClick={() => navigate(path.slice(0, -1))} divider><ListItemText primary=".." /></ListItemButton>}
          {files.map((file, index) => (
            <ListItemButton key={file.name} divider={index < files.length - 1} sx={{ px: 2, py: 0.75, minHeight: 44, gap: 1 }} onClick={() => {
              setNotice('')
              if (file.directory) navigate([...path, file.name])
              else if (file.name.endsWith('.jar')) setNotice('Binary files cannot be edited.')
              else setSelected(file)
            }}>
              <ListItemIcon sx={{ minWidth: 28, color: file.directory ? 'primary.main' : 'text.secondary' }}>{file.directory ? <FolderOutlinedIcon fontSize="small" /> : <DescriptionOutlinedIcon fontSize="small" />}</ListItemIcon>
              <ListItemText primary={file.name} slotProps={{ primary: { variant: 'body2', sx: { overflowWrap: 'anywhere' } } }} />
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>{file.size}</Typography>
            </ListItemButton>
          ))}
        </List>
        {files.length === 0 && <Box sx={{ py: 5, textAlign: 'center' }}><Typography variant="body2" color="text.secondary">{search ? 'No matching files' : 'Empty directory'}</Typography>{search && <Button onClick={() => setSearch('')}>Clear search</Button>}</Box>}
      </Paper>
      {notice && <Typography variant="body2" color="text.secondary" role="status">{notice}</Typography>}
      {selected && <FileEditor key={fileKey} name={selected.name} content={contents[fileKey] ?? ''} onClose={() => setSelected(null)} onSave={(content) => { setContents((current) => ({ ...current, [fileKey]: content })); setSelected(null) }} />}
    </Stack>
  )
}

export default function ServerFiles({ server }: ServerProps) {
  return <FileManager key={server.id} server={server} />
}
