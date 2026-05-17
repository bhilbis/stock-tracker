import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const [command, ...args] = process.argv.slice(2)

if (!command) {
  console.error('Missing command')
  process.exit(1)
}

const bins = {
  'electron-vite': resolve(__dirname, '..', 'node_modules', 'electron-vite', 'bin', 'electron-vite.js'),
  'electron-rebuild': resolve(__dirname, '..', 'node_modules', '@electron', 'rebuild', 'lib', 'cli.js')
}

const bin = bins[command]

if (!bin) {
  console.error(`Unsupported command: ${command}`)
  process.exit(1)
}

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(process.execPath, [bin, ...args], {
  cwd: resolve(__dirname, '..'),
  env,
  stdio: 'inherit',
  shell: false
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 1)
})
