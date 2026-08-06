const fs = require('fs')
const path = require('path')

async function main () {
  const png = path.join(__dirname, '..', 'build', 'icons', 'icon.png')
  const ico = path.join(__dirname, '..', 'build', 'icons', 'icon.ico')
  const pngToIco = (await import('png-to-ico')).default
  const buf = await pngToIco(png)
  fs.writeFileSync(ico, buf)
  console.log('Wrote', ico, buf.length, 'bytes')
}

main().catch(function (err) {
  console.error(err)
  process.exit(1)
})
