import { LinearProgress, Stack, Typography } from '@mui/material'
import type { DownloadProgressState } from '../types'

function size(bytes: number) { return `${(bytes / 1024 / 1024).toFixed(1)} MiB` }

export default function DownloadProgress({ progress }: { progress: DownloadProgressState }) {
  const percent = progress.total ? Math.min(100, progress.received / progress.total * 100) : 0
  const label = {
    resolving: `Finding ${progress.label ?? 'server'} build…`, downloading: `Downloading ${progress.label ?? 'JAR'}`, verifying: 'Verifying checksums…',
    extracting: `Extracting ${progress.label ?? 'archive'}…`, installing: `Installing ${progress.label ?? 'JAR'}…`, complete: progress.label ? `${progress.label} installed` : 'Installed', failed: progress.error ?? 'Download failed.',
  }[progress.phase]
  const active = !['complete', 'failed'].includes(progress.phase)
  return (
    <Stack spacing={1} sx={{ width: '100%' }} role="status" aria-live="polite">
      <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Typography variant="caption" color={progress.phase === 'failed' ? 'error' : 'text.secondary'}>{label}</Typography>
        {progress.phase === 'downloading' && <Typography variant="caption" color="text.secondary">{Math.floor(percent)}%</Typography>}
      </Stack>
      {active && <LinearProgress aria-label="Download progress" variant={!progress.total ? 'indeterminate' : 'determinate'} value={percent} sx={{ borderRadius: 1, height: 4 }} />}
      {progress.phase === 'downloading' && <Typography variant="caption" color="text.secondary">
        {size(progress.received)} / {size(progress.total)}{progress.bytesPerSecond > 0 ? ` · ${size(progress.bytesPerSecond)}/s` : ''}
      </Typography>}
    </Stack>
  )
}
