import { useEffect, useRef } from 'react'
import { useMock } from '../data/MockProvider'
import { Box, Paper } from '@mui/material'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { ServerProps } from '../types'

interface ConsoleSession {
  terminal: Terminal
  line: string
  cursor: number
  history: string[]
  historyIndex: number
  draft: string
  logCount: number
  draw: () => void
}

export default function ServerConsole({ server }: ServerProps) {
  const { updateServer } = useMock()
  const containerRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<ConsoleSession | null>(null)
  const latestRef = useRef({ server, updateServer })

  useEffect(() => {
    latestRef.current = { server, updateServer }
  }, [server, updateServer])

  useEffect(() => {
    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      cursorWidth: 2,
      cursorInactiveStyle: 'none',
      fontFamily: '"DejaVu Sans Mono", Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.5,
      scrollback: 2000,
      smoothScrollDuration: 100,
      screenReaderMode: true,
      theme: { background: '#101010', foreground: '#ffffff', cursor: '#ffffff', selectionBackground: '#424242' },
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(containerRef.current!)
    const session: ConsoleSession = { terminal, line: '', cursor: 0, history: [], historyIndex: 0, draft: '', logCount: 0, draw: () => {} }
    sessionRef.current = session
    // Keep editable input on one terminal row, scrolling long commands horizontally.
    const draw = () => {
      const width = Math.max(1, terminal.cols - 3)
      const start = Math.max(0, session.cursor - width)
      terminal.write(`\r\x1b[2K> ${session.line.slice(start, start + width)}`)
      terminal.write(`\r\x1b[${2 + session.cursor - start}C`)
    }
    session.draw = draw
    const resize = () => {
      if (containerRef.current?.clientWidth) {
        fit.fit()
        draw()
      }
    }
    resize()
    const input = terminal.onData((data) => {
      if (data === '\r') {
        const command = session.line.trim()
        if (!command) return
        session.history.push(session.line)
        session.historyIndex = session.history.length
        session.line = ''
        session.cursor = 0
        session.draft = ''
        const current = latestRef.current
        current.updateServer(current.server.id, {
          logs: [...current.server.logs, `> ${command}`, '[MOCK] Command received; no backend connected.'],
        })
      } else if (data === '\x03') {
        terminal.write('^C\r\n')
        session.line = ''
        session.cursor = 0
      } else if (data === '\x7f') {
        if (session.cursor > 0) {
          session.line = session.line.slice(0, session.cursor - 1) + session.line.slice(session.cursor)
          session.cursor--
        }
      } else if (data === '\x1b[3~') {
        session.line = session.line.slice(0, session.cursor) + session.line.slice(session.cursor + 1)
      } else if (data === '\x1b[D') session.cursor = Math.max(0, session.cursor - 1)
      else if (data === '\x1b[C') session.cursor = Math.min(session.line.length, session.cursor + 1)
      else if (data === '\x01' || data === '\x1b[H') session.cursor = 0
      else if (data === '\x05' || data === '\x1b[F') session.cursor = session.line.length
      else if (data === '\x1b[A' || data === '\x1b[B') {
        if (session.historyIndex === session.history.length) session.draft = session.line
        session.historyIndex = Math.max(0, Math.min(session.history.length, session.historyIndex + (data === '\x1b[A' ? -1 : 1)))
        session.line = session.history[session.historyIndex] ?? session.draft
        session.cursor = session.line.length
      } else {
        // Paste stays on the current line; control sequences are never executed.
        if (data.startsWith('\x1b')) return
        const text = [...data.replace(/[\r\n]+/g, ' ')].filter((character) => {
          const code = character.codePointAt(0)!
          return code >= 32 && (code < 127 || code > 159)
        }).join('')
        session.line = session.line.slice(0, session.cursor) + text + session.line.slice(session.cursor)
        session.cursor += text.length
      }
      draw()
    })
    const observer = new ResizeObserver(resize)
    observer.observe(containerRef.current!)

    return () => {
      observer.disconnect()
      input.dispose()
      sessionRef.current = null
      terminal.dispose()
    }
  }, [server.id])

  useEffect(() => {
    const session = sessionRef.current
    if (!session) return
    const newLogs = server.logs.slice(session.logCount)
    if (!newLogs.length) return
    session.terminal.write('\r\x1b[2K')
    newLogs.forEach((line) => session.terminal.writeln(line))
    session.logCount = server.logs.length
    session.draw()
  }, [server.id, server.logs])

  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
      <Box role="region" aria-label="Server console" sx={{
        height: { xs: 360, md: 480 },
        p: 2,
        pr: 0,
        pb: '19.25px',
        bgcolor: '#101010',
        '& .xterm': { height: '100%' },
        '& .xterm .xterm-scrollable-element': { backgroundColor: '#101010' },
        '& .xterm-viewport': {
          backgroundColor: '#101010 !important',
          overscrollBehavior: 'contain',
          scrollbarWidth: 'thin',
          scrollbarColor: '#383838 transparent',
          '&::-webkit-scrollbar': { width: 6 },
          '&::-webkit-scrollbar-track': { background: 'transparent' },
          '&::-webkit-scrollbar-thumb': { background: '#383838', borderRadius: 6 },
          '&::-webkit-scrollbar-thumb:hover': { background: '#555' },
        },
        '& .xterm .xterm-scrollable-element > .shadow': { display: 'none' },
        '& .xterm .xterm-scrollable-element > .scrollbar': { opacity: 0, transition: 'opacity 150ms' },
        '&:hover .xterm .xterm-scrollable-element > .scrollbar, &:focus-within .xterm .xterm-scrollable-element > .scrollbar': { opacity: 1 },
        '& .xterm .xterm-scrollable-element > .scrollbar > .slider': { borderRadius: 6, background: '#383838 !important', left: 'auto !important', right: 0, width: '5px !important' },
      }}>
        <Box ref={containerRef} sx={{ height: '100%', minWidth: 0, overflow: 'hidden' }} />
      </Box>
    </Paper>
  )
}
