// Shared renderer logic (login + common UI)
document.addEventListener('DOMContentLoaded', () => {
  // Attach login handler if on login page
  const form = document.getElementById('loginForm')
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const uEl = document.getElementById('username')
      const pEl = document.getElementById('password')
      const u = uEl ? uEl.value : ''
      const p = pEl ? pEl.value : ''
      const btn = form.querySelector('button[type="submit"]')

      // UI: disable inputs and show loading on button
      if (btn) { btn.disabled = true; btn.classList.add('loading') }
      if (uEl) uEl.disabled = true
      if (pEl) pEl.disabled = true
      try {
        const res = await window.electronAPI.auth.login(u, p)
        console.log('login response', res)
        const errEl = document.getElementById('loginErr')
        if (res && res.success) {
          window.location.href = './index.html'
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
        if (btn) { btn.disabled = false; btn.classList.remove('loading') }
      }
    })
  }

  // sidebar toggle
  const toggle = document.getElementById('toggleSidebar')
  if (toggle) {
    toggle.addEventListener('click', () => {
      const sb = document.querySelector('.sidebar')
      if (sb) sb.classList.toggle('collapse')
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
  window.showPage = function(name) {
    document.querySelectorAll('.page').forEach(function(s){ s.classList.remove('active') })
    var target = document.getElementById('page-' + name)
    if (target) target.classList.add('active')
    document.querySelectorAll('.nav-item').forEach(function(n){ n.classList.remove('active') })
    var nav = document.querySelector('.nav-item[data-page="' + name + '"]')
    if (nav) nav.classList.add('active')
    // page-specific hooks
    if (name === 'daily-sales'   && typeof window._renderDailyPage   === 'function') window._renderDailyPage()
    if (name === 'monthly-sales' && typeof window._renderMonthlyPage === 'function') window._renderMonthlyPage()
  }

  // wire sidebar nav data-page clicks
  document.querySelectorAll('.nav-item[data-page]').forEach(function(item) {
    item.addEventListener('click', function() {
      window.showPage(item.getAttribute('data-page'))
    })
  })

  // if on dashboard, boot it
  if (document.getElementById('dailyChart')) {
    import('./dashboard.js').then(m => m.initDashboard())
  }
})
