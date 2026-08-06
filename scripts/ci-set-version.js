const fs = require('fs')
const path = require('path')

const pkgPath = path.join(__dirname, '..', 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
const run = Number(process.env.GITHUB_RUN_NUMBER || 0)

// 0.1.{build} — higher on every main push so electron-updater sees a new release.
pkg.version = run > 0 ? `0.1.${run}` : pkg.version

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
console.log(`GCash POS CI version: ${pkg.version}`)
