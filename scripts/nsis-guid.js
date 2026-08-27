// Computes electron-builder NSIS GUID (same algorithm as app-builder-lib).
const crypto = require('crypto')

const UUID_NAMESPACE = Buffer.from([
  0x6b, 0xa7, 0xb8, 0x10, 0x9d, 0xad, 0x11, 0xd1,
  0x80, 0xb4, 0x00, 0xc0, 0x4f, 0xd4, 0x30, 0xc8
])

function nsisGuid (appId) {
  const hash = crypto.createHash('sha1')
    .update(UUID_NAMESPACE)
    .update(appId, 'utf8')
    .digest()

  const bytes = Buffer.from(hash.subarray(0, 16))
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex = bytes.toString('hex')
  return (
    hex.slice(0, 8) + '-' +
    hex.slice(8, 12) + '-' +
    hex.slice(12, 16) + '-' +
    hex.slice(16, 20) + '-' +
    hex.slice(20, 32)
  ).toUpperCase()
}

const ids = [
  'com.gcashpos.desktop',
  'com.yourcompany.gcash-pos',
  'com.cashpos.desktop'
]

ids.forEach(function (id) {
  console.log(id + ' => ' + nsisGuid(id))
})
