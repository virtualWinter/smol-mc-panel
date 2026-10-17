import Panel from './main'
import ServerOverview from './components/ServerOverview'
import ServerPage from './components/ServerPage'
import { snapshot } from './server/store'

export default function App({ url }: { url: string }) {
  const path = new URL(url).pathname.split('/').filter(Boolean)
  return (
    <Panel state={snapshot()}>
      {path.length === 0 ? <ServerOverview /> : <ServerPage key={path[0]} serverId={path[0]} page={path.slice(1).join('/')} />}
    </Panel>
  )
}
