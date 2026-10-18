import { useRef, useState } from 'react'
import { Box, Breadcrumbs, Button, InputAdornment, Link, List, ListItemButton, ListItemIcon, ListItemText, Paper, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import ViewListOutlinedIcon from '@mui/icons-material/ViewListOutlined'
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined'
import FolderIcon from '@mui/icons-material/Folder'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import SearchIcon from '@mui/icons-material/Search'
import useFileManager from './useFileManager'
import FileEditor from './FileEditor'
import type { ServerProps, ServerFile } from '../types'
import { displayDate } from './ui-format'

function FileManager({ server }: ServerProps) {
  const [selected, setSelected] = useState<ServerFile | null>(null)
  const { entries, filePath, saveFile, readFile, notice, setNotice, target, dropProps, dragProps, upload, uploading } = useFileManager(server.id)
  const picker = useRef<HTMLInputElement>(null)
  const path = filePath.split('/').filter(Boolean)
  const [content, setContent] = useState('')
  const [opening, setOpening] = useState(false)
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'list' | 'grid'>('list')
  const directory = path.join('/')
  const files = entries.filter((file) => file.path.split('/').slice(0, -1).join('/') === directory)
    .filter((file) => file.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => Number(Boolean(b.directory)) - Number(Boolean(a.directory)) || a.name.localeCompare(b.name))
  const navigate = (next: string[]) => {
    const url = new URL(window.location.href)
    if (next.length) url.searchParams.set('path', next.join('/'))
    else url.searchParams.delete('path')
    history.pushState(null, '', url)
    window.dispatchEvent(new Event('panel:navigate'))
    setSearch(''); setNotice('')
  }
  const fileKey = [...path, selected?.name].join('/')

  return (
    <Stack spacing={2.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
        <Breadcrumbs separator="/" aria-label="File path" sx={{ fontSize: 14, lineHeight: '20px', '& .MuiBreadcrumbs-li': { display: 'flex', alignItems: 'center' }, '& .MuiLink-root': { display: 'block', p: 0, lineHeight: '20px', fontFamily: 'inherit', verticalAlign: 'baseline' }, '& .MuiBreadcrumbs-separator': { mx: 0.5, color: 'text.disabled', lineHeight: '20px' } }}>
          <Link {...dropProps('')} component="button" underline="hover" color={path.length ? 'text.secondary' : 'text.primary'} onClick={() => navigate([])} sx={{ fontSize: 14 }} aria-label="Root directory">/</Link>
          {path.map((part, index) => <Link {...dropProps(path.slice(0, index + 1).join('/'))} key={index} component="button" underline="hover" color="text.primary" onClick={() => navigate(path.slice(0, index + 1))} sx={{ fontSize: 14 }}>{part}</Link>)}
        </Breadcrumbs>
        <Stack direction="row" spacing={1}>
          <TextField placeholder="Search files" value={search} onChange={(event) => setSearch(event.target.value)} sx={{ flex: 1, width: { sm: 200 }, minWidth: 0 }} slotProps={{ htmlInput: { 'aria-label': 'Search files' }, input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
          <Button variant="outlined" disabled={uploading} onClick={() => picker.current?.click()}>{uploading ? 'Uploading…' : 'Upload'}</Button>
          <input ref={picker} type="file" multiple hidden aria-label="Upload files" onChange={(event) => { if (event.target.files) void upload(directory, event.target.files).catch((error: unknown) => setNotice(String(error))); event.target.value = '' }} />
          <ToggleButtonGroup exclusive size="small" value={view} onChange={(_, value: 'list' | 'grid' | null) => { if (value) setView(value) }} aria-label="File view">
            <ToggleButton value="list" aria-label="List view"><ViewListOutlinedIcon fontSize="small" /></ToggleButton>
            <ToggleButton value="grid" aria-label="Grid view"><GridViewOutlinedIcon fontSize="small" /></ToggleButton>
          </ToggleButtonGroup>
        </Stack>
      </Stack>
      <Paper {...dropProps(directory)} variant="outlined" sx={{ overflow: 'hidden', outline: target === directory ? '2px solid' : 'none', outlineColor: 'primary.main', outlineOffset: -2 }}>
        {view === 'list' && <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr) 72px', sm: 'minmax(0, 1fr) 100px 180px' }, color: 'text.secondary', borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="caption" sx={{ px: 2, py: 0.75 }}>Name</Typography>
          <Typography variant="caption" sx={{ px: 1.5, py: 0.75 }}>Size</Typography>
          <Typography variant="caption" sx={{ display: { xs: 'none', sm: 'block' }, px: 1.5, py: 0.75 }}>Modified</Typography>
        </Box>}
        <List disablePadding sx={view === 'grid' ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 0.5, p: 1 } : { py: 0.5 }}>
          {files.map((file) => (
            <ListItemButton key={file.name} title={file.name} sx={view === 'grid' ? { flexDirection: 'column', justifyContent: 'center', textAlign: 'center', borderRadius: 1, p: 2, minHeight: 104 } : { display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr) 72px', sm: 'minmax(0, 1fr) 100px 180px' }, px: 0, py: 0.25, minHeight: 42, '&.Mui-focusVisible': { outline: '1px solid', outlineColor: 'primary.main', outlineOffset: -1 } }} onClick={() => {
              setNotice('')
              if (file.directory) navigate([...path, file.name])
              else if (file.binary) setNotice('Binary files cannot be edited.')
              else if (!opening) {
                setOpening(true)
                void readFile(server.id, file.path).then((text) => { setContent(text); setSelected(file) }).catch((error: unknown) => setNotice(String(error))).finally(() => setOpening(false))
              }
            }} {...dragProps(file.path)} {...(file.directory ? dropProps(file.path) : {})} style={{ outline: target === file.path ? '2px solid #90caf9' : undefined, outlineOffset: -2 }}>
              <Stack direction={view === 'grid' ? 'column' : 'row'} spacing={1} sx={{ alignItems: 'center', minWidth: 0, width: '100%', px: view === 'list' ? 2 : 0 }}>
                <ListItemIcon sx={{ minWidth: 0, color: file.directory ? 'primary.main' : 'text.secondary', '& svg': { fontSize: view === 'grid' ? 36 : 20 } }}>{file.directory ? <FolderIcon /> : <DescriptionOutlinedIcon />}</ListItemIcon>
                <ListItemText primary={file.name} sx={{ minWidth: 0, maxWidth: '100%' }} slotProps={{ primary: { variant: 'body2', noWrap: true } }} />
              </Stack>
              {view === 'list' && <Typography variant="caption" color="text.secondary" sx={{ px: 1.5 }}>{file.size}</Typography>}
              {view === 'list' && <Typography variant="caption" color="text.secondary" title={file.modified} sx={{ display: { xs: 'none', sm: 'block' }, px: 1.5 }}>{displayDate(file.modified)}</Typography>}
            </ListItemButton>
          ))}
        </List>
        {files.length === 0 && <Box sx={{ py: 5, textAlign: 'center' }}><Typography variant="body2" color="text.secondary">{search ? 'No matching files' : 'Empty directory'}</Typography>{search && <Button onClick={() => setSearch('')}>Clear search</Button>}</Box>}
      </Paper>
      {notice && <Typography variant="body2" color="text.secondary" role="status">{notice}</Typography>}
      {selected && <FileEditor key={fileKey} name={selected.name} content={content} onClose={() => setSelected(null)} onSave={async (content) => { await saveFile(server.id, fileKey, content); setSelected(null) }} />}
    </Stack>
  )
}

export default function ServerFiles({ server }: ServerProps) {
  return <FileManager key={server.id} server={server} />
}
