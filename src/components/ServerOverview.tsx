import { useState } from 'react'
import { Box, Divider, InputAdornment, Paper, Stack, TextField, Typography } from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import ServerCard from './ServerCard'
import { useMock } from '../data/MockProvider'

export default function ServerOverview() {
  const { servers: allServers } = useMock()
  const proxy = allServers.find((server) => server.id === 'proxy')!
  const servers = allServers.filter((server) => server.id !== 'proxy')
  const [search, setSearch] = useState('')
  const filtered = servers.filter((server) => `${server.name} ${server.address}`.toLowerCase().includes(search.toLowerCase()))

  return (
    <Stack spacing={2}>
      <Box>
        <Typography component="h1" variant="h6" sx={{ fontWeight: 600 }}>Network</Typography>
      </Box>
      <Stack component="section" spacing={1} aria-labelledby="proxy-heading">
        <Box>
          <Typography id="proxy-heading" component="h2" variant="caption" color="text.secondary">Proxy</Typography>
        </Box>
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}><ServerCard server={proxy} /></Paper>
      </Stack>
      <Stack component="section" spacing={1} aria-labelledby="servers-heading">
       <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography id="servers-heading" component="h2" variant="caption" color="text.secondary">Servers</Typography>
      <TextField
        placeholder="Search servers…"
        size="small"
        sx={{ width: { xs: 200, sm: 240 } }}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        slotProps={{
          htmlInput: { 'aria-label': 'Search servers' },
          input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> },
        }}
      />
      </Stack>
      <Paper variant="outlined" sx={{ overflow: 'hidden' }}><Stack divider={<Divider />}>
        {filtered.map((server) => <ServerCard key={server.id} server={server} />)}
        {filtered.length === 0 && <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>No servers match your search.</Typography>}
      </Stack></Paper>
      </Stack>
    </Stack>
  )
}
