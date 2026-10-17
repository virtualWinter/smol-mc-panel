import { useState } from 'react'
import { Box, InputAdornment, Stack, TextField, Typography } from '@mui/material'
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
    <Stack spacing={3}>
      <Box>
        <Typography component="h1" variant="h4" sx={{ fontWeight: 600 }} gutterBottom>Network overview</Typography>
      </Box>
      <Stack component="section" spacing={1.5} aria-labelledby="proxy-heading">
        <Box>
          <Typography id="proxy-heading" component="h2" variant="subtitle1" sx={{ fontWeight: 600 }}>Proxy</Typography>
        </Box>
        <ServerCard server={proxy} />
      </Stack>
      <Stack component="section" spacing={1.5} aria-labelledby="servers-heading">
      <Box>
        <Typography id="servers-heading" component="h2" variant="subtitle1" sx={{ fontWeight: 600 }}>Servers</Typography>
      </Box>
      <TextField
        placeholder="Search servers…"
        size="small"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        slotProps={{
          htmlInput: { 'aria-label': 'Search servers' },
          input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> },
        }}
      />
      <Stack spacing={1.5}>
        {filtered.map((server) => <ServerCard key={server.id} server={server} />)}
        {filtered.length === 0 && <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>No servers match your search.</Typography>}
      </Stack>
      </Stack>
    </Stack>
  )
}
