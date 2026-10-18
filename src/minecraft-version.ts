/** Prefer the explicit agent field. Older agents report a full Paper build string. */
export function reportedMinecraftVersion(metrics?: { minecraftVersion?: string; serverVersion?: string }): string | undefined {
  if (metrics?.minecraftVersion && /^[0-9][0-9a-zA-Z.+_-]{1,39}$/u.test(metrics.minecraftVersion)) return metrics.minecraftVersion
  const text = metrics?.serverVersion ?? ''
  return text.match(/\bMC:\s*(\d+\.\d+(?:\.\d+)?)/u)?.[1]
    ?? text.match(/^(?:git-Paper-)?(\d+\.\d+(?:\.\d+)?)(?:-|\s|$)/u)?.[1]
}
