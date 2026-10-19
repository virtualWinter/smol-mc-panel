import Panel, { Shell } from './main'
import ServerOverview from './components/ServerOverview'
import ServerPage from './components/ServerPage'
import { dataRoot, snapshot } from './server/store'
import { readAccount } from './server/accounts'
import { requestContext } from './server/request-context'
import { configExists, javaVersions, loadConfig } from './server/config'
import SetupForm from './components/SetupForm'
import LoginForm from './components/LoginForm'

export default async function App({ url }: { url: string }) {
  const root = dataRoot()
  if (!readAccount(root)) {
    const proxy = configExists(root) ? loadConfig(root).find((server) => server.kind !== 'paper') : undefined
    return <Shell><SetupForm existingProxy={proxy?.kind === 'paper' ? undefined : proxy?.kind} javaVersions={javaVersions} /></Shell>
  }
  if (!requestContext().user) return <Shell><LoginForm /></Shell>
  const path = new URL(url).pathname.split('/').filter(Boolean)
  return (
    <Panel state={await snapshot(url)}>
      {path.length === 0 ? <ServerOverview /> : <ServerPage key={path[0]} serverId={path[0]} page={path.slice(1).join('/')} />}
    </Panel>
  )
}
