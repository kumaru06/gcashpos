(function () {
  function $(id) { return document.getElementById(id) }

  var ICON_DOWNLOAD = ''
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">'
    + '<path d="M12 3v12m0 0l4-4m-4 4l-4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/>'
    + '</svg>'

  var ICON_CHECK = ''
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">'
    + '<path d="M20 6L9 17l-5-5"/>'
    + '</svg>'

  var ICON_INFO = ''
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">'
    + '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'
    + '</svg>'

  var ICON_ARROW = ''
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">'
    + '<path d="M5 12h14M13 6l6 6-6 6"/>'
    + '</svg>'

  function ensureModal () {
    if ($('updateOverlay')) return

    var html = ''
      + '<div class="overlay" id="updateOverlay" aria-hidden="true">'
      + '  <div class="modal update-modal" id="updateModal" role="dialog" aria-labelledby="updateTitle" data-state="available">'
      + '    <div class="update-hero">'
      + '      <div class="update-hero-ico" id="updateHeroIcon">' + ICON_DOWNLOAD + '</div>'
      + '      <div class="update-hero-copy">'
      + '        <h2 class="update-hero-title" id="updateTitle">Update Available</h2>'
      + '        <p class="update-hero-sub" id="updateHeroSub">New CashPOS version ready.</p>'
      + '      </div>'
      + '      <button type="button" class="update-hero-x" id="updateClose" aria-label="Close">&times;</button>'
      + '    </div>'
      + '    <div class="update-content">'
      + '      <div class="update-version-row" id="updateVersionRow">'
      + '        <span class="update-ver-pill current"><small>Now</small> <strong id="updateCurrentVersion">v0.1.0</strong></span>'
      + '        <span class="update-ver-arrow" aria-hidden="true">' + ICON_ARROW + '</span>'
      + '        <span class="update-ver-pill new"><small>New</small> <strong id="updateNewVersion">v0.1.0</strong></span>'
      + '      </div>'
      + '      <p id="updateMessage" class="update-message">Get the latest fixes and improvements.</p>'
      + '      <div class="update-note" id="updateNote">'
      + ICON_INFO
      + '        <span id="updateNoteText">You can keep working while it downloads.</span>'
      + '      </div>'
      + '      <div class="update-progress-wrap" id="updateProgressWrap" hidden>'
      + '        <div class="update-progress-top">'
      + '          <span class="update-progress-title">Downloading</span>'
      + '          <span class="update-progress-pct" id="updateProgressPct">0%</span>'
      + '        </div>'
      + '        <div class="update-progress-bar"><div class="update-progress-fill" id="updateProgressFill"></div></div>'
      + '        <p class="update-progress-label" id="updateProgressLabel">Keep CashPOS open until finished.</p>'
      + '      </div>'
      + '    </div>'
      + '    <div class="update-ftr" id="updateActions">'
      + '      <button type="button" class="btn btn-outline" id="updateLaterBtn">Later</button>'
      + '      <button type="button" class="btn btn-primary" id="updateDownloadBtn">' + ICON_DOWNLOAD + ' Download</button>'
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

  function setModalState (state) {
    var modal = $('updateModal')
    if (modal) modal.dataset.state = state || 'available'
  }

  function setVersionRow (currentVersion, newVersion) {
    if ($('updateCurrentVersion')) $('updateCurrentVersion').textContent = 'v' + (currentVersion || '?')
    if ($('updateNewVersion')) $('updateNewVersion').textContent = 'v' + (newVersion || '?')
  }

  function setFooterMode (mode) {
    var footer = $('updateActions')
    var laterBtn = $('updateLaterBtn')
    if (!footer || !laterBtn) return
    if (mode === 'single') {
      footer.classList.add('is-single')
      laterBtn.style.display = 'none'
    } else {
      footer.classList.remove('is-single')
      laterBtn.style.display = ''
    }
  }

  function setHero (iconHtml, title, subtitle) {
    if ($('updateHeroIcon')) $('updateHeroIcon').innerHTML = iconHtml
    if ($('updateTitle')) $('updateTitle').textContent = title
    if ($('updateHeroSub')) $('updateHeroSub').textContent = subtitle
  }

  function openModal () {
    ensureModal()
    var overlay = $('updateOverlay')
    if (!overlay) return
    overlay.classList.remove('closing')
    overlay.classList.remove('open')
    void overlay.offsetWidth
    overlay.classList.add('open')
    overlay.setAttribute('aria-hidden', 'false')
    document.body.style.overflow = 'hidden'
  }

  function closeModal () {
    var overlay = $('updateOverlay')
    if (!overlay) return
    if (!overlay.classList.contains('open') || overlay.classList.contains('closing')) return
    overlay.classList.add('closing')
    var done = false
    function finish () {
      if (done) return
      done = true
      overlay.classList.remove('open', 'closing')
      overlay.setAttribute('aria-hidden', 'true')
      if (!document.querySelector('.overlay.open')) document.body.style.overflow = ''
    }
    function onAnimEnd (e) {
      if (e.target !== overlay) return
      overlay.removeEventListener('animationend', onAnimEnd)
      finish()
    }
    overlay.addEventListener('animationend', onAnimEnd)
    setTimeout(finish, 220)
  }

  var currentState = 'idle'
  var latestVersion = ''
  var currentVersion = ''

  function setPrimary (label, action, withIcon) {
    var btn = $('updateDownloadBtn')
    if (!btn) return
    btn.innerHTML = (withIcon || '') + label
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
      if ($('updateNote')) $('updateNote').hidden = true
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

    if (payload.version) latestVersion = payload.version
    if (payload.currentVersion) currentVersion = payload.currentVersion

    if (payload.state === 'available') {
      ensureModal()
      setModalState('available')
      setVersionRow(payload.currentVersion, payload.version)
      setHero(
        ICON_DOWNLOAD,
        'Update Available',
        'New CashPOS version ready.'
      )
      if ($('updateMessage')) {
        $('updateMessage').textContent = 'v' + (payload.version || '?')
          + ' is ready — latest fixes and improvements.'
      }
      if ($('updateNote')) {
        $('updateNote').hidden = false
        if ($('updateNoteText')) {
          $('updateNoteText').textContent = 'You can keep working while it downloads.'
        }
      }
      if ($('updateProgressWrap')) $('updateProgressWrap').hidden = true
      if ($('updateVersionRow')) $('updateVersionRow').hidden = false
      setFooterMode('dual')
      setPrimary('Download', 'download', ICON_DOWNLOAD)
      openModal()
      return
    }

    if (payload.state === 'downloading') {
      ensureModal()
      setModalState('downloading')
      setVersionRow(payload.currentVersion || currentVersion, payload.version || latestVersion)
      setHero(
        ICON_DOWNLOAD,
        'Downloading…',
        'Keep CashPOS open until done.'
      )
      if ($('updateMessage')) {
        $('updateMessage').textContent = 'Downloading v' + (payload.version || latestVersion || '?') + '…'
      }
      if ($('updateNote')) $('updateNote').hidden = true
      if ($('updateProgressWrap')) $('updateProgressWrap').hidden = false
      if ($('updateVersionRow')) $('updateVersionRow').hidden = false
      var pct = payload.percent || 0
      if ($('updateProgressFill')) $('updateProgressFill').style.width = pct + '%'
      if ($('updateProgressPct')) $('updateProgressPct').textContent = pct + '%'
      if ($('updateProgressLabel')) {
        $('updateProgressLabel').textContent = pct >= 100
          ? 'Download complete. Preparing…'
          : 'Downloading update package…'
      }
      setFooterMode('dual')
      setPrimary('Downloading…', 'download')
      if ($('updateDownloadBtn')) $('updateDownloadBtn').disabled = true
      openModal()
      return
    }

    if (payload.state === 'ready') {
      ensureModal()
      setModalState('ready')
      setVersionRow(payload.currentVersion || currentVersion, payload.version || latestVersion)
      setHero(
        ICON_CHECK,
        'Ready to Install',
        'Restart to finish updating.'
      )
      if ($('updateMessage')) {
        $('updateMessage').textContent = 'Restart now to install v'
          + (payload.version || latestVersion || '?') + '.'
      }
      if ($('updateNote')) {
        $('updateNote').hidden = false
        if ($('updateNoteText')) {
          $('updateNoteText').textContent = 'App will close briefly, then reopen.'
        }
      }
      if ($('updateProgressWrap')) $('updateProgressWrap').hidden = true
      if ($('updateVersionRow')) $('updateVersionRow').hidden = false
      setFooterMode('single')
      setPrimary('Restart & update', 'restart', ICON_CHECK)
      openModal()
      return
    }

    if (payload.state === 'error' && payload.message && window._toast) {
      window._toast(payload.message, 'error')
    }
  }

  function sleep (ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms) })
  }

  window.checkAppUpdates = async function (manual) {
    if (!window.electronAPI || !window.electronAPI.updater) {
      if (window._toast) window._toast('Updater not available', 'info')
      return
    }

    // Always show "Checking…" first so the user sees the sequence clearly.
    if (manual && window._toast) window._toast('Checking for updates…', 'update')

    var canUpdate = true
    if (window.electronAPI.updater.isEnabled) {
      try { canUpdate = await window.electronAPI.updater.isEnabled() } catch (e) { canUpdate = true }
    }

    if (manual && !canUpdate) {
      // Let "Checking…" appear first, then show the installed-app-only note.
      await sleep(900)
      if (window._toast) {
        window._toast('Auto-update runs in the installed app only.', 'update')
      }
      return
    }

    var result = await window.electronAPI.updater.check(manual)
    if (!result) return

    if (manual && result.upToDate && window._toast) {
      window._toast(result.message || 'You are on the latest version.', 'success')
      return
    }

    if (manual && result.ok === false && result.message && window._toast) {
      window._toast(result.message, 'update')
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
