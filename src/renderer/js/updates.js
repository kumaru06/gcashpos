(function () {
  function $(id) { return document.getElementById(id) }

  function ensureModal () {
    if ($('updateOverlay')) return

    var html = ''
      + '<div class="overlay" id="updateOverlay" aria-hidden="true">'
      + '  <div class="modal update-modal" role="dialog" aria-labelledby="updateTitle">'
      + '    <div class="modal-hdr">'
      + '      <span class="modal-title" id="updateTitle">Update Available</span>'
      + '      <button type="button" class="modal-x" id="updateClose" aria-label="Close">&times;</button>'
      + '    </div>'
      + '    <div class="modal-body">'
      + '      <p id="updateMessage" class="update-message">A new version of CashPOS is ready.</p>'
      + '      <div class="update-progress-wrap" id="updateProgressWrap" hidden>'
      + '        <div class="update-progress-bar"><div class="update-progress-fill" id="updateProgressFill"></div></div>'
      + '        <p class="update-progress-label" id="updateProgressLabel">Downloading… 0%</p>'
      + '      </div>'
      + '    </div>'
      + '    <div class="modal-ftr update-actions" id="updateActions">'
      + '      <button type="button" class="btn btn-outline" id="updateLaterBtn">Later</button>'
      + '      <button type="button" class="btn btn-primary" id="updateDownloadBtn">Download update</button>'
      + '    </div>'
      + '  </div>'
      + '</div>'

    document.body.insertAdjacentHTML('beforeend', html)

    $('updateClose').addEventListener('click', closeModal)
    $('updateLaterBtn').addEventListener('click', closeModal)
    $('updateDownloadBtn').addEventListener('click', onPrimaryAction)
    $('updateOverlay').addEventListener('click', function (e) {
      if (e.target === $('updateOverlay')) closeModal()
    })
  }

  function openModal () {
    ensureModal()
    var overlay = $('updateOverlay')
    if (!overlay) return
    overlay.classList.add('open')
    overlay.setAttribute('aria-hidden', 'false')
    document.body.style.overflow = 'hidden'
  }

  function closeModal () {
    var overlay = $('updateOverlay')
    if (!overlay) return
    overlay.classList.remove('open')
    overlay.setAttribute('aria-hidden', 'true')
    document.body.style.overflow = ''
  }

  var currentState = 'idle'

  function setPrimary (label, action) {
    var btn = $('updateDownloadBtn')
    if (!btn) return
    btn.textContent = label
    btn.dataset.action = action
    btn.disabled = false
  }

  async function onPrimaryAction () {
    if (!window.electronAPI || !window.electronAPI.updater) return
    var action = ($('updateDownloadBtn') && $('updateDownloadBtn').dataset.action) || 'download'

    if (action === 'download') {
      setPrimary('Downloading…', 'download')
      $('updateDownloadBtn').disabled = true
      var wrap = $('updateProgressWrap')
      if (wrap) wrap.hidden = false
      await window.electronAPI.updater.download()
      return
    }

    if (action === 'restart') {
      setPrimary('Restarting…', 'restart')
      $('updateDownloadBtn').disabled = true
      await window.electronAPI.updater.install()
    }
  }

  function handleStatus (payload) {
    if (!payload || !payload.state) return
    currentState = payload.state

    if (payload.state === 'available') {
      ensureModal()
      $('updateTitle').textContent = 'Update Available'
      $('updateMessage').textContent = 'CashPOS v' + payload.version + ' is available. You are on v'
        + (payload.currentVersion || '?') + '.'
      if ($('updateProgressWrap')) $('updateProgressWrap').hidden = true
      if ($('updateLaterBtn')) $('updateLaterBtn').style.display = ''
      setPrimary('Download update', 'download')
      openModal()
      return
    }

    if (payload.state === 'downloading') {
      ensureModal()
      if ($('updateProgressWrap')) $('updateProgressWrap').hidden = false
      var pct = payload.percent || 0
      if ($('updateProgressFill')) $('updateProgressFill').style.width = pct + '%'
      if ($('updateProgressLabel')) $('updateProgressLabel').textContent = 'Downloading… ' + pct + '%'
      setPrimary('Downloading…', 'download')
      if ($('updateDownloadBtn')) $('updateDownloadBtn').disabled = true
      openModal()
      return
    }

    if (payload.state === 'ready') {
      ensureModal()
      $('updateTitle').textContent = 'Ready to Install'
      $('updateMessage').textContent = 'Version ' + payload.version + ' downloaded. Restart to finish updating.'
      if ($('updateProgressWrap')) $('updateProgressWrap').hidden = true
      if ($('updateLaterBtn')) $('updateLaterBtn').style.display = 'none'
      setPrimary('Restart & update', 'restart')
      openModal()
      return
    }

    if (payload.state === 'error' && payload.message && window._toast) {
      window._toast(payload.message, 'error')
    }
  }

  window.checkAppUpdates = async function (manual) {
    if (!window.electronAPI || !window.electronAPI.updater) {
      if (window._toast) window._toast('Updater not available', 'info')
      return
    }
    if (manual && window._toast) window._toast('Checking for updates…', 'info')
    var result = await window.electronAPI.updater.check(manual)
    if (manual && result && result.upToDate && window._toast) {
      window._toast(result.message || 'You are on the latest version.', 'success')
      return
    }
    if (manual && result && result.message && result.ok === false && window._toast) {
      window._toast(result.message, 'info')
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    ensureModal()
    if (window.electronAPI && window.electronAPI.on) {
      window.electronAPI.on('updater:status', handleStatus)
    }
    if (window.electronAPI && window.electronAPI.updater && window.electronAPI.updater.getVersion) {
      window.electronAPI.updater.getVersion().then(function (v) {
        var el = document.getElementById('aboutVersion')
        if (el && v) el.textContent = 'Version ' + v
      }).catch(function () {})
    }
  })
})()
