import { useState } from 'react'
import { Box, Breadcrumbs, Button, InputAdornment, Link, List, ListItemButton, ListItemIcon, ListItemText, Paper, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import ViewListOutlinedIcon from '@mui/icons-material/ViewListOutlined'
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined'
import FolderIcon from '@mui/icons-material/Folder'
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
  const [view, setView] = useState<'list' | 'grid'>('list')
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
        <Stack direction="row" spacing={1}>
          <TextField placeholder="Search files…" value={search} onChange={(event) => setSearch(event.target.value)} sx={{ width: { xs: '100%', sm: 240 }, minWidth: 0 }} slotProps={{ htmlInput: { 'aria-label': 'Search files' }, input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
          <ToggleButtonGroup exclusive size="small" value={view} onChange={(_, value: 'list' | 'grid' | null) => { if (value) setView(value) }} aria-label="File view">
            <ToggleButton value="list" aria-label="List view"><ViewListOutlinedIcon fontSize="small" /></ToggleButton>
            <ToggleButton value="grid" aria-label="Grid view"><GridViewOutlinedIcon fontSize="small" /></ToggleButton>
          </ToggleButtonGroup>
        </Stack>
      </Stack>
      <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
        {view === 'list' && <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr) 72px', sm: 'minmax(0, 1fr) 100px 180px' }, bgcolor: 'action.hover', borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="caption" sx={{ px: 2, py: 0.75 }}>Name</Typography>
          <Typography variant="caption" sx={{ px: 1.5, py: 0.75, borderLeft: 1, borderColor: 'divider' }}>Size</Typography>
          <Typography variant="caption" sx={{ display: { xs: 'none', sm: 'block' }, px: 1.5, py: 0.75, borderLeft: 1, borderColor: 'divider' }}>Modified</Typography>
        </Box>}
        {path.length > 0 && <ListItemButton onClick={() => navigate(path.slice(0, -1))} divider><ListItemText primary=".." /></ListItemButton>}
        <List disablePadding sx={view === 'grid' ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 1, p: 1.5 } : {}}>
          {files.map((file, index) => (
            <ListItemButton key={file.name} sx={view === 'grid' ? { flexDirection: 'column', justifyContent: 'flex-start', textAlign: 'center', borderRadius: 1, p: 1.5, gap: 0.5, minHeight: 120 } : { display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr) 72px', sm: 'minmax(0, 1fr) 100px 180px' }, px: 0, py: 0.5, minHeight: 52, bgcolor: index % 2 ? 'action.hover' : 'transparent', '&.Mui-focusVisible': { outline: '1px solid', outlineColor: 'primary.main', outlineOffset: -1 } }} onClick={() => {
              setNotice('')
              if (file.directory) navigate([...path, file.name])
              else if (file.name.endsWith('.jar')) setNotice('Binary files cannot be edited.')
              else setSelected(file)
            }}>
              <Stack direction={view === 'grid' ? 'column' : 'row'} spacing={1.5} sx={{ alignItems: 'center', minWidth: 0, px: view === 'list' ? 2 : 0 }}>
                <ListItemIcon sx={{ minWidth: 0, color: file.directory ? 'primary.main' : 'text.secondary', '& svg': { fontSize: view === 'grid' ? 48 : 36 } }}>{file.directory ? <FolderIcon /> : <DescriptionOutlinedIcon />}</ListItemIcon>
                <ListItemText primary={file.name} slotProps={{ primary: { variant: 'body2', sx: { overflowWrap: 'anywhere' } } }} />
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ px: 1.5 }}>{file.size}</Typography>
              {view === 'list' && <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' }, px: 1.5 }}>{file.modified ?? '—'}</Typography>}
            </ListItemButton>
          ))}
        </List>
        {files.length === 0 && <Box sx={{ py: 5, textAlign: 'center' }}><Typography variant="body2" color="text.secondary">{search ? 'No matching files' : 'Empty directory'}</Typography>{search && <Button onClick={() => setSearch('')}>Clear search</Button>}</Box>}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 2, py: 0.75, borderTop: 1, borderColor: 'divider' }}>{files.filter((file) => file.directory).length} folders, {files.filter((file) => !file.directory).length} files</Typography>
      </Paper>
      {notice && <Typography variant="body2" color="text.secondary" role="status">{notice}</Typography>}
      {selected && <FileEditor key={fileKey} name={selected.name} content={contents[fileKey] ?? ''} onClose={() => setSelected(null)} onSave={(content) => { setContents((current) => ({ ...current, [fileKey]: content })); setSelected(null) }} />}
    </Stack>
  )
}

export default function ServerFiles({ server }: ServerProps) {
  return <FileManager key={server.id} server={server} />
}
