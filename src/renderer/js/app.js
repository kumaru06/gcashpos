// Shared renderer logic (login + common UI)

window.setGcashPosSessionUser = function (user) {
  window.__gcashPosSessionUser = user || null
}

window.getGcashPosSessionUser = function () {
  return window.__gcashPosSessionUser || null
}

window.isGcashPosAdmin = function () {
  var user = window.getGcashPosSessionUser()
  return !!user && (user.role || '').toLowerCase() === 'admin'
}

window.readCachedSessionUser = function () {
  try {
    var u = JSON.parse(localStorage.getItem('gcashPosCurrentUser') || 'null')
    if (u && u.username) return u
  } catch (e) {}
  return null
}

window.refreshGcashPosSession = async function () {
  var memoryUser = window.getGcashPosSessionUser()
  window.__gcashPosSessionDegraded = false
  if (!window.electronAPI || !window.electronAPI.auth || !window.electronAPI.auth.getSession) {
    var offlineUser = memoryUser || window.readCachedSessionUser()
    if (offlineUser) {
      window.setGcashPosSessionUser(offlineUser)
      window.__gcashPosSessionDegraded = true
    }
    return offlineUser
  }
  try {
    var res = await window.electronAPI.auth.getSession()
    if (res && res.success && res.user) {
      window.setGcashPosSessionUser(res.user)
      try { localStorage.setItem('gcashPosCurrentUser', JSON.stringify(res.user)) } catch (e) {}
      return res.user
    }
    window.setGcashPosSessionUser(null)
    try { localStorage.removeItem('gcashPosCurrentUser') } catch (e) {}
    return null
  } catch (err) {
    console.warn('auth:getSession unavailable, using cached session', err && err.message ? err.message : err)
    var cached = memoryUser || window.readCachedSessionUser()
    if (cached) {
      window.setGcashPosSessionUser(cached)
      window.__gcashPosSessionDegraded = true
      return cached
    }
    return null
  }
}

window.requireLiveSessionForAdmin = async function () {
  if (!window.electronAPI || !window.electronAPI.auth || !window.electronAPI.auth.getSession) {
    return window.__gcashPosSessionDegraded !== true
  }
  try {
    var res = await window.electronAPI.auth.getSession()
    if (res && res.success && res.user) {
      window.setGcashPosSessionUser(res.user)
      window.__gcashPosSessionDegraded = false
      try { localStorage.setItem('gcashPosCurrentUser', JSON.stringify(res.user)) } catch (e) {}
      return (res.user.role || '').toLowerCase() === 'admin'
    }
  } catch (e) {}
  return false
}

document.addEventListener('DOMContentLoaded', () => {
  const splash = document.getElementById('loginSplash')
  if (splash) {
    setTimeout(() => {
      splash.classList.add('hide')
      setTimeout(() => splash.remove(), 450)
    }, 1500)
  }

  // Attach login handler if on login page
  const form = document.getElementById('loginForm')
  if (form) {
    const roleInput = document.getElementById('loginRole')
    let loginSubmitting = false

    // Prefill Remember me + auto-enter dashboard if session was resumed.
    ;(async function bootstrapRememberedSession () {
      try {
        if (window.electronAPI && window.electronAPI.auth && window.electronAPI.auth.getSession) {
          var live = await window.electronAPI.auth.getSession()
          if (live && live.success && live.user) {
            window.setGcashPosSessionUser(live.user)
            try { localStorage.setItem('gcashPosCurrentUser', JSON.stringify(live.user)) } catch (e) {}
            window.location.href = './index.html'
            return
          }
        }
      } catch (e) {}
      try {
        if (window.electronAPI && window.electronAPI.auth && window.electronAPI.auth.getRemembered) {
          var rem = await window.electronAPI.auth.getRemembered()
          var remembered = rem && rem.remembered
          if (remembered && remembered.username) {
            var uEl = document.getElementById('username')
            var remEl = document.getElementById('remember')
            if (uEl) uEl.value = remembered.username
            if (roleInput && remembered.role) roleInput.value = remembered.role
            if (remEl) remEl.checked = true
          }
        }
      } catch (e) {}
    })()

    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      if (loginSubmitting) return
      loginSubmitting = true
      const uEl = document.getElementById('username')
      const pEl = document.getElementById('password')
      const remEl = document.getElementById('remember')
      const u = uEl ? uEl.value.trim() : ''
      const p = pEl ? pEl.value : ''
      const role = roleInput ? roleInput.value : undefined
      const rememberMe = !!(remEl && remEl.checked)
      const btn = form.querySelector('button[type="submit"]')

      // UI: disable inputs and show loading on button
      if (btn) { btn.disabled = true; btn.classList.add('loading') }
      if (uEl) uEl.disabled = true
      if (pEl) pEl.disabled = true
      try {
        const res = await window.electronAPI.auth.login(u, p, role, rememberMe)
        console.log('login response', res)
        const errEl = document.getElementById('loginErr')
        if (res && res.success) {
          window.setGcashPosSessionUser(res.user || null)
          try { localStorage.setItem('gcashPosCurrentUser', JSON.stringify(res.user || {})) } catch (e) {}
          // Reset stale profile label from old default admin sessions
          try {
            var loggedIn = res.user || {}
            var ownerKey = String(loggedIn.owner_username || loggedIn.username || 'guest').toLowerCase()
            var settingsKey = 'gcashPosSettings:' + ownerKey
            var settings = {}
            try { settings = JSON.parse(localStorage.getItem(settingsKey) || '{}') } catch (e2) { settings = {} }
            settings.profileName = loggedIn.full_name || loggedIn.username || settings.profileName
            settings.profileInitials = String(settings.profileName || 'A').split(/\s+/).filter(Boolean).slice(0,2).map(function(p){ return p.charAt(0).toUpperCase() }).join('') || 'A'
            settings.profilePhoto = ''
            if (!settings.profilePhotos) settings.profilePhotos = {}
            if (loggedIn.username && loggedIn.username !== 'admin') {
              if (settings.profileEmail === 'admin@cashpos.local') settings.profileEmail = ''
            }
            localStorage.setItem(settingsKey, JSON.stringify(settings))
          } catch (e) {}
          window.location.href = './index.html'
          return
        } else {
          const msg = (res && res.error) ? res.error : 'Invalid username or password'
          if (errEl) errEl.textContent = msg
          form.classList.remove('shake')
          void form.offsetWidth
          form.classList.add('shake')
          setTimeout(() => form.classList.remove('shake'), 600)
          if (pEl) { pEl.value = ''; pEl.disabled = false; pEl.focus(); }
          if (uEl) uEl.disabled = false
        }
      } catch (err) {
        console.error('Login invoke error', err)
        const errEl = document.getElementById('loginErr')
        if (errEl) errEl.textContent = err && err.message ? err.message : 'Login error'
        if (pEl) { pEl.value = ''; pEl.disabled = false; pEl.focus(); }
      } finally {
        loginSubmitting = false
        if (btn) { btn.disabled = false; btn.classList.remove('loading') }
        if (uEl) uEl.disabled = false
        if (pEl) pEl.disabled = false
      }
    })
  }

  // sidebar toggle
  const toggle = document.getElementById('toggleSidebar') || document.getElementById('sidebarToggle')
  if (toggle) {
    toggle.addEventListener('click', () => {
      const sb = document.querySelector('.sidebar')
      if (sb) sb.classList.toggle('collapsed')
    })
  }

  // animate Daily Sales chart when user clicks nav item
  const navDaily = document.getElementById('nav-daily-sales')
  if (navDaily) {
    navDaily.addEventListener('click', () => {
      const card = document.getElementById('dailyChartCard')
      if (!card) return
      card.classList.remove('scale-in-left')
      // force reflow to restart animation
      void card.offsetWidth
      card.classList.add('scale-in-left')
    })
  }

  // sidebar nav click: toggle active border and class
  const navLinks = document.querySelectorAll('.sidebar nav a')
  if (navLinks && navLinks.length) {
    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        navLinks.forEach(l => l.classList.remove('active'))
        link.classList.add('active')
        // add a short "clicked" class to trigger CSS animation, then remove it
        link.classList.remove('clicked')
        // force reflow to restart animation if present
        void link.offsetWidth
        link.classList.add('clicked')
        // cleanup after animation finishes
        const onAnimEnd = (ev) => { link.classList.remove('clicked'); link.removeEventListener('animationend', onAnimEnd) }
        link.addEventListener('animationend', onAnimEnd)
      })
      // pointer hover: play a shorter hover animation for tactile feedback
      link.addEventListener('pointerenter', (e) => {
        // don't trigger if it's a keyboard focus event (pointer only)
        if (e.pointerType === 'mouse' || e.pointerType === 'pen' || e.pointerType === 'touch') {
          link.classList.remove('hovered')
          void link.offsetWidth
          link.classList.add('hovered')
          const onHoverEnd = () => { link.classList.remove('hovered'); link.removeEventListener('animationend', onHoverEnd) }
          link.addEventListener('animationend', onHoverEnd)
        }
      })
      // ensure hovered state removed on pointerleave (prevents stuck state on some platforms)
      link.addEventListener('pointerleave', () => {
        link.classList.remove('hovered')
      })
    })
  }

  // ── PAGE NAVIGATION ──
  window.showPage = async function (name) {
    var adminOnly = ['staff', 'settings', 'about'].includes(name)
    if (adminOnly && window.requireLiveSessionForAdmin) {
      var liveAdmin = await window.requireLiveSessionForAdmin()
      if (!liveAdmin) {
        if (typeof window._toast === 'function') {
          window._toast('Please sign in again as Administrator to open this section', 'error')
        }
        window.location.href = './login.html'
        return
      }
    }

    var user = await window.refreshGcashPosSession()
    if (!user) {
      window.location.href = './login.html'
      return
    }
    var role = (user.role || '').toLowerCase()
    if (role !== 'admin' && adminOnly) {
      if (typeof window._toast === 'function') window._toast('Only Admin can open this section', 'error')
      name = 'dashboard'
    }
    // Close any open modal so nav/buttons are never blocked by a stuck overlay.
    if (typeof window._closeAllOverlays === 'function') {
      window._closeAllOverlays()
    } else {
      document.querySelectorAll('.overlay.open').forEach(function(el){ el.classList.remove('open') })
      document.body.style.overflow = ''
    }
    document.querySelectorAll('.page').forEach(function(s){ s.classList.remove('active') })
    var target = document.getElementById('page-' + name)
    if (target) target.classList.add('active')
    document.querySelectorAll('.nav-item').forEach(function(n){ n.classList.remove('active') })
    var nav = document.querySelector('.nav-item[data-page="' + name + '"]')
    if (nav) nav.classList.add('active')
    // page-specific hooks (defer chart pages so layout has real size)
    function runHook(fn){
      if (typeof fn !== 'function') return
      requestAnimationFrame(function(){
        try { fn() } catch (e) { console.error('page hook failed', e) }
      })
    }
    if (name === 'daily-sales')   runHook(window._renderDailyPage)
    if (name === 'monthly-sales') runHook(window._renderMonthlyPage)
    if (name === 'reports')       runHook(window._renderReportsPage)
    if (name === 'settings')      runHook(window._renderSettingsPage)
    if (name === 'staff')         runHook(window._renderStaffPage)
    if (name === 'about')         runHook(window._renderAboutPage)
  }

  // wire sidebar nav — prevent link drag ghost in Electron
  document.querySelectorAll('.nav-item[data-page]').forEach(function(item) {
    item.setAttribute('draggable', 'false')
    item.setAttribute('role', 'button')
    item.addEventListener('dragstart', function (e) { e.preventDefault() })
    item.addEventListener('click', function (e) {
      e.preventDefault()
      e.stopPropagation()
      window.showPage(item.getAttribute('data-page'))
    })
  })

  document.querySelectorAll('.sidebar img, .sidebar svg').forEach(function(el) {
    el.setAttribute('draggable', 'false')
    el.addEventListener('dragstart', function (e) { e.preventDefault() })
  })

  // Fallback: Add Staff button even if dashboard boot partially failed
  document.addEventListener('click', function(e){
    var add = e.target && e.target.closest ? e.target.closest('#staffAddBtn') : null
    if(!add) return
    e.preventDefault()
    if (typeof window._openStaffModal === 'function') window._openStaffModal(null)
  })

  // dashboard.js is loaded directly by index.html
})
