import fs from 'node:fs/promises'
import path from 'node:path'
import pngToIco from 'png-to-ico'

const rootDir = process.cwd()
const sourceIcon = path.join(rootDir, 'src', 'renderer', 'src', 'assets', 'tracker.png')
const outputDir = path.join(rootDir, 'build')
const outputIcon = path.join(outputDir, 'icon.ico')

await fs.mkdir(outputDir, { recursive: true })

const icoBuffer = await pngToIco(sourceIcon)
await fs.writeFile(outputIcon, icoBuffer)

console.log(`Created ${path.relative(rootDir, outputIcon)} from ${path.relative(rootDir, sourceIcon)}`)
