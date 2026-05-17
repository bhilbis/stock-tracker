import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export default async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return

  const rootDir = context.packager.projectDir
  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`)
  const iconPath = path.join(rootDir, 'build', 'icon.ico')
  const rceditPath = path.join(rootDir, 'node_modules', 'electron-winstaller', 'vendor', 'rcedit.exe')

  for (const requiredPath of [exePath, iconPath, rceditPath]) {
    if (!existsSync(requiredPath)) {
      throw new Error(`Missing required file for Windows icon patch: ${requiredPath}`)
    }
  }

  await execFileAsync(rceditPath, [exePath, '--set-icon', iconPath], {
    cwd: rootDir,
    windowsHide: true
  })
}
