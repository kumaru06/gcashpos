/* dashboard.js */
;(function(){
  'use strict'

  var PAGE_SIZE = 8
  var page = 1
  var rows = []
  var typeFilter = ''
  var searchQ = ''
  var dChart = null
  var mChart = null
  var reportChart = null
  // Customer page state
  var cPage = 1
  var cTypeFilter = ''
  var cStatusFilter = ''
  var cSearchQ = ''

  // ── HELPERS ──
  function $(id){ return document.getElementById(id) }
  function setText(id, v){ var el=$(id); if(el) el.textContent=v }
  function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] }) }
  function money(n){ return Number(n||0).toLocaleString('en-PH',{minimumFractionDigits:0}) }
  function fmtDate(s){ if(!s) return '—'; var d=new Date(s); return d.toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric'}) }
  function currentUser(){ try { return JSON.parse(localStorage.getItem('gcashPosCurrentUser') || '{}') } catch(e){ return {} } }
  function currentUserIsAdmin(){ return ((currentUser().role || '').toLowerCase() === 'admin') }
  function isValidReferenceNumber(ref){ return /^\d{4}-\d{3}-\d{6}$/.test(String(ref || '').trim()) }
  function fmtDateLong(s){
    if(!s) return '—'
    var d = new Date(s)
    return d.toLocaleDateString('en-PH',{year:'numeric',month:'long',day:'numeric'})
      + ' ' + d.toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true})
  }

  // ── TOAST ──
  var ICONS = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
    error:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    info:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
  }
  function toast(msg, type){
    type = (['success','error','info'].includes(type)) ? type : 'info'
    var wrap = $('toastWrap'); if(!wrap) return
    var t = document.createElement('div')
    t.className = 'toast ' + type
    t.innerHTML = '<div class="toast-icon">' + (ICONS[type] || ICONS.info) + '</div>'
                + '<div class="toast-txt">' + msg + '</div>'
    wrap.appendChild(t)
    setTimeout(function(){
      t.classList.add('out')
      t.addEventListener('animationend', function(){ t.remove() }, {once:true})
    }, 3200)
  }
  window._toast = toast

  function getTxnNotifications(){
    try { return JSON.parse(localStorage.getItem('gcashPosNotifications') || '[]') }
    catch(e){ return [] }
  }

  function saveTxnNotifications(items){
    localStorage.setItem('gcashPosNotifications', JSON.stringify(items.slice(0, 60)))
  }

  function addTxnNotification(tx, action){
    if(!tx) return
    var items = getTxnNotifications()
    var amount = Number(tx.amount)||0
    var typeLabel = tx.type === 'cash_in' ? 'Cash In' : tx.type === 'cash_out' ? 'Cash Out' : 'Transaction'
    items.unshift({
      id: 'notif_' + Date.now(),
      txId: String(tx.id || ''),
      transactionId: tx.transaction_id || '—',
      title: action || 'Transaction added',
      text: tx.notificationText || ((tx.customer_name || 'Walk-in') + ' • ' + typeLabel + (amount ? ' • ₱' + money(amount) : '')),
      createdAt: new Date().toISOString(),
      snapshot: tx
    })
    saveTxnNotifications(items)
    if(typeof window._updateNotifications === 'function') window._updateNotifications()
  }

  function showActionConfirm(title, msg, onOk, okLabel, okClass){
    if(typeof window._showConfirm === 'function'){
      window._showConfirm(title, msg, onOk, okLabel, okClass)
    } else if(window.confirm(title + '\n\n' + msg)){
      onOk()
    }
  }

  // ── SUMMARY ──
  var _summaryData = {}
  var _period = 'daily'

  function applyPeriod(period, animate){
    _period = period
    var s = _summaryData
    var daily = (period === 'daily')

    // toggle button states
    var btnD = $('periodDaily'), btnM = $('periodMonthly')
    if(btnD){ btnD.classList.toggle('active', daily) }
    if(btnM){ btnM.classList.toggle('active', !daily) }

    // labels
    var lci = $('lblCashIn'),  lco = $('lblCashOut'), ln = $('lblNet'), lsf = $('lblServiceFee')
    if(lci) lci.textContent  = daily ? 'Cash In Today'       : 'Total Cash In'
    if(lco) lco.textContent  = daily ? 'Cash Out Today'      : 'Total Cash Out'
    if(ln)  ln.textContent   = daily ? 'Net Today'           : 'Total Net (In + Out)'
    if(lsf) lsf.textContent  = daily ? 'Service Fee Today'   : 'Total Service Fee'

    var cashIn  = daily ? (s.dailyCashIn       || 0) : (s.totalCashIn      || 0)
    var cashOut = daily ? (s.dailyCashOut      || 0) : (s.totalCashOut     || 0)
    var sf      = daily ? (s.dailyServiceFee   || 0) : (s.totalServiceFee  || 0)
    var net     = cashIn + cashOut

    // sub-labels
    var inEl  = $('cashInMonth');     if(inEl)  inEl.textContent  = ''
    var outEl = $('cashOutMonth');    if(outEl) outEl.textContent = ''
    var sfEl  = $('serviceFeeMonth'); if(sfEl)  sfEl.textContent  = ''

    var anims = document.querySelectorAll('.card-anim')
    if(animate && anims.length){
      anims.forEach(function(el){ el.classList.add('card-fade-out') })
      setTimeout(function(){
        setText('totalCashIn',   '₱' + money(cashIn))
        setText('totalCashOut',  '₱' + money(cashOut))
        setText('salesGrowth',   '₱' + money(net))
        setText('totalServiceFee','₱' + money(sf))
        anims.forEach(function(el){ el.classList.remove('card-fade-out'); el.classList.add('card-fade-in') })
        setTimeout(function(){ anims.forEach(function(el){ el.classList.remove('card-fade-in') }) }, 300)
      }, 200)
    } else {
      setText('totalCashIn',   '₱' + money(cashIn))
      setText('totalCashOut',  '₱' + money(cashOut))
      setText('salesGrowth',   '₱' + money(net))
      setText('totalServiceFee','₱' + money(sf))
    }
  }

  window.setPeriod = async function(period){
    if(window.electronAPI && window.electronAPI.db){
      try { _summaryData = await window.electronAPI.db.getSummary() } catch(e){}
    }
    applyPeriod(period, true)
  }

  async function loadSummary(){
    try{
      var s = (window.electronAPI && window.electronAPI.db)
               ? await window.electronAPI.db.getSummary()
               : {}
      _summaryData = s
      applyPeriod(_period, false)
      // daily banner
      var dIn   = s.dailyCashIn  || 0
      var dOut  = s.dailyCashOut || 0
      var dNet  = dIn + dOut
      setText('dailyCashIn',       '₱' + money(dIn))
      setText('dailyCashOut',      '₱' + money(dOut))
      setText('dailyNet',          '₱' + money(dNet))
      setText('dailyCashInCount',  (s.dailyCashInCount  || 0) + ' transaction' + ((s.dailyCashInCount  || 0)===1?'':'s'))
      setText('dailyCashOutCount', (s.dailyCashOutCount || 0) + ' transaction' + ((s.dailyCashOutCount || 0)===1?'':'s'))
      var netNote = $('dailyNetNote')
      if(netNote){ netNote.textContent = 'In + Out'; netNote.style.color = '#22C55E' }
      var netVal = $('dailyNet')
      if(netVal){ netVal.style.color = '#22C55E' }
      var todayLbl = $('todayDateLbl')
      if(todayLbl) todayLbl.textContent = new Date().toLocaleDateString('en-PH',{weekday:'long',year:'numeric',month:'long',day:'numeric'})
    }catch(e){ console.warn('summary', e) }
  }

  // ── SAMPLE DATA ──
  function sampleRows(){
    var now = new Date()
    var yr = now.getFullYear()
    function iso(y,m,d){ return new Date(y,m-1,d,10,0,0).toISOString() }
    return [
      // Apr 8 – 21 daily spread
      {id:101,transaction_id:'TXN-S101',created_at:iso(yr,4,8),  customer_name:'Maria Santos',   type:'cash_in', amount:3200,  status:'success',sync_status:'synced'},
      {id:102,transaction_id:'TXN-S102',created_at:iso(yr,4,8),  customer_name:'Pedro Reyes',    type:'cash_out',amount:1500,  status:'success',sync_status:'synced'},
      {id:103,transaction_id:'TXN-S103',created_at:iso(yr,4,9),  customer_name:'Ana Garcia',     type:'cash_in', amount:7800,  status:'success',sync_status:'synced'},
      {id:104,transaction_id:'TXN-S104',created_at:iso(yr,4,9),  customer_name:'Luis Torres',    type:'cash_out',amount:3400,  status:'success',sync_status:'synced'},
      {id:105,transaction_id:'TXN-S105',created_at:iso(yr,4,10), customer_name:'Albert Goopio',  type:'cash_in', amount:12000, status:'success',sync_status:'synced'},
      {id:106,transaction_id:'TXN-S106',created_at:iso(yr,4,10), customer_name:'Aiza Villadores',type:'cash_out',amount:5600,  status:'success',sync_status:'synced'},
      {id:107,transaction_id:'TXN-S107',created_at:iso(yr,4,11), customer_name:'Juan dela Cruz', type:'cash_in', amount:9500,  status:'success',sync_status:'synced'},
      {id:108,transaction_id:'TXN-S108',created_at:iso(yr,4,11), customer_name:'Maria Santos',   type:'cash_out',amount:4200,  status:'success',sync_status:'synced'},
      {id:109,transaction_id:'TXN-S109',created_at:iso(yr,4,12), customer_name:'Pedro Reyes',    type:'cash_in', amount:15000, status:'success',sync_status:'synced'},
      {id:110,transaction_id:'TXN-S110',created_at:iso(yr,4,12), customer_name:'Ana Garcia',     type:'cash_out',amount:6800,  status:'success',sync_status:'synced'},
      {id:111,transaction_id:'TXN-S111',created_at:iso(yr,4,13), customer_name:'Luis Torres',    type:'cash_in', amount:5500,  status:'success',sync_status:'synced'},
      {id:112,transaction_id:'TXN-S112',created_at:iso(yr,4,13), customer_name:'Albert Goopio', type:'cash_out',amount:2200,  status:'success',sync_status:'synced'},
      {id:113,transaction_id:'TXN-S113',created_at:iso(yr,4,14), customer_name:'Aiza Villadores',type:'cash_in', amount:21000, status:'success',sync_status:'synced'},
      {id:114,transaction_id:'TXN-S114',created_at:iso(yr,4,14), customer_name:'Juan dela Cruz', type:'cash_out',amount:9500,  status:'success',sync_status:'synced'},
      {id:115,transaction_id:'TXN-S115',created_at:iso(yr,4,15), customer_name:'Maria Santos',   type:'cash_in', amount:8800,  status:'success',sync_status:'synced'},
      {id:116,transaction_id:'TXN-S116',created_at:iso(yr,4,15), customer_name:'Pedro Reyes',    type:'cash_out',amount:4100,  status:'success',sync_status:'synced'},
      {id:117,transaction_id:'TXN-S117',created_at:iso(yr,4,16), customer_name:'Ana Garcia',     type:'cash_in', amount:6200,  status:'success',sync_status:'synced'},
      {id:118,transaction_id:'TXN-S118',created_at:iso(yr,4,17), customer_name:'Luis Torres',    type:'cash_in', amount:18500, status:'success',sync_status:'synced'},
      {id:119,transaction_id:'TXN-S119',created_at:iso(yr,4,17), customer_name:'Albert Goopio', type:'cash_out',amount:7700,  status:'success',sync_status:'synced'},
      {id:120,transaction_id:'TXN-S120',created_at:iso(yr,4,18), customer_name:'Aiza Villadores',type:'cash_in', amount:11000, status:'success',sync_status:'synced'},
      {id:121,transaction_id:'TXN-S121',created_at:iso(yr,4,18), customer_name:'Juan dela Cruz', type:'cash_out',amount:5300,  status:'success',sync_status:'synced'},
      {id:122,transaction_id:'TXN-S122',created_at:iso(yr,4,19), customer_name:'Maria Santos',   type:'cash_in', amount:25000, status:'success',sync_status:'synced'},
      {id:123,transaction_id:'TXN-S123',created_at:iso(yr,4,19), customer_name:'Pedro Reyes',    type:'cash_out',amount:11000, status:'success',sync_status:'synced'},
      {id:124,transaction_id:'TXN-S124',created_at:iso(yr,4,20), customer_name:'Ana Garcia',     type:'cash_in', amount:9900,  status:'success',sync_status:'synced'},
      {id:125,transaction_id:'TXN-S125',created_at:iso(yr,4,20), customer_name:'Luis Torres',    type:'cash_out',amount:4500,  status:'success',sync_status:'synced'},
      {id:126,transaction_id:'TXN-S126',created_at:iso(yr,4,21), customer_name:'Albert Goopio', type:'cash_in', amount:14000, status:'success',sync_status:'synced'},
      {id:127,transaction_id:'TXN-S127',created_at:iso(yr,4,21), customer_name:'Aiza Villadores',type:'cash_out',amount:6200,  status:'success',sync_status:'synced'},
      // Full year monthly spread (Jan–Dec)
      {id:201,transaction_id:'TXN-M201',created_at:iso(yr,1,15),  customer_name:'Juan dela Cruz', type:'cash_in', amount:45000, status:'success',sync_status:'synced'},
      {id:202,transaction_id:'TXN-M202',created_at:iso(yr,1,15),  customer_name:'Maria Santos',   type:'cash_out',amount:18000, status:'success',sync_status:'synced'},
      {id:203,transaction_id:'TXN-M203',created_at:iso(yr,2,10),  customer_name:'Pedro Reyes',    type:'cash_in', amount:62000, status:'success',sync_status:'synced'},
      {id:204,transaction_id:'TXN-M204',created_at:iso(yr,2,10),  customer_name:'Ana Garcia',     type:'cash_out',amount:27000, status:'success',sync_status:'synced'},
      {id:205,transaction_id:'TXN-M205',created_at:iso(yr,3,5),   customer_name:'Luis Torres',    type:'cash_in', amount:38000, status:'success',sync_status:'synced'},
      {id:206,transaction_id:'TXN-M206',created_at:iso(yr,3,5),   customer_name:'Albert Goopio', type:'cash_out',amount:15000, status:'success',sync_status:'synced'},
      {id:207,transaction_id:'TXN-M207',created_at:iso(yr,5,20),  customer_name:'Aiza Villadores',type:'cash_in', amount:71000, status:'success',sync_status:'synced'},
      {id:208,transaction_id:'TXN-M208',created_at:iso(yr,5,20),  customer_name:'Juan dela Cruz', type:'cash_out',amount:32000, status:'success',sync_status:'synced'},
      {id:209,transaction_id:'TXN-M209',created_at:iso(yr,6,12),  customer_name:'Maria Santos',   type:'cash_in', amount:55000, status:'success',sync_status:'synced'},
      {id:210,transaction_id:'TXN-M210',created_at:iso(yr,6,12),  customer_name:'Pedro Reyes',    type:'cash_out',amount:23000, status:'success',sync_status:'synced'},
      {id:211,transaction_id:'TXN-M211',created_at:iso(yr,7,8),   customer_name:'Ana Garcia',     type:'cash_in', amount:83000, status:'success',sync_status:'synced'},
      {id:212,transaction_id:'TXN-M212',created_at:iso(yr,7,8),   customer_name:'Luis Torres',    type:'cash_out',amount:41000, status:'success',sync_status:'synced'},
      {id:213,transaction_id:'TXN-M213',created_at:iso(yr,8,22),  customer_name:'Albert Goopio', type:'cash_in', amount:49000, status:'success',sync_status:'synced'},
      {id:214,transaction_id:'TXN-M214',created_at:iso(yr,8,22),  customer_name:'Aiza Villadores',type:'cash_out',amount:19500, status:'success',sync_status:'synced'},
      {id:215,transaction_id:'TXN-M215',created_at:iso(yr,9,14),  customer_name:'Juan dela Cruz', type:'cash_in', amount:67000, status:'success',sync_status:'synced'},
      {id:216,transaction_id:'TXN-M216',created_at:iso(yr,9,14),  customer_name:'Maria Santos',   type:'cash_out',amount:28000, status:'success',sync_status:'synced'},
      {id:217,transaction_id:'TXN-M217',created_at:iso(yr,10,3),  customer_name:'Pedro Reyes',    type:'cash_in', amount:92000, status:'success',sync_status:'synced'},
      {id:218,transaction_id:'TXN-M218',created_at:iso(yr,10,3),  customer_name:'Ana Garcia',     type:'cash_out',amount:44000, status:'success',sync_status:'synced'},
      {id:219,transaction_id:'TXN-M219',created_at:iso(yr,11,18), customer_name:'Luis Torres',    type:'cash_in', amount:115000,status:'success',sync_status:'synced'},
      {id:220,transaction_id:'TXN-M220',created_at:iso(yr,11,18), customer_name:'Albert Goopio', type:'cash_out',amount:52000, status:'success',sync_status:'synced'},
      {id:221,transaction_id:'TXN-M221',created_at:iso(yr,12,25), customer_name:'Aiza Villadores',type:'cash_in', amount:138000,status:'success',sync_status:'synced'},
      {id:222,transaction_id:'TXN-M222',created_at:iso(yr,12,25), customer_name:'Juan dela Cruz', type:'cash_out',amount:63000, status:'success',sync_status:'synced'}
    ]
  }

  // ── CHARTS ──
  function chartDefaults(){
    if(!window.Chart) return
    Chart.defaults.font.family = "'Segoe UI', Inter, Arial, sans-serif"
    Chart.defaults.font.size   = 12
    Chart.defaults.color       = '#6B7280'
    Chart.defaults.plugins.legend.display = false
  }

  function makeGradient(ctx){
    var g = ctx.createLinearGradient(0,0,0,260)
    g.addColorStop(0, 'rgba(76,110,245,.9)')
    g.addColorStop(1, 'rgba(76,110,245,.18)')
    return g
  }

  var baseOpts = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {duration:600, easing:'easeOutQuart'},
    plugins:{
      tooltip:{
        backgroundColor:'#1F2937', cornerRadius:8, padding:10,
        titleColor:'#9CA3AF', bodyColor:'#fff',
        callbacks:{ label: function(c){ return ' ₱' + c.parsed.y.toLocaleString('en-PH') } }
      }
    },
    scales:{
      x:{ grid:{display:false}, border:{display:false} },
      y:{ grid:{color:'#F3F4F6'}, border:{display:false},
          ticks:{ callback: function(v){ return v>=1000 ? '₱'+(v/1000).toFixed(0)+'k' : '₱'+v } } }
    }
  }

  function localDate(s){
    // returns 'YYYY-MM-DD' in local time, not UTC
    var d = s ? new Date(s) : new Date()
    var yr = d.getFullYear()
    var mo = String(d.getMonth()+1).padStart(2,'0')
    var dy = String(d.getDate()).padStart(2,'0')
    return yr+'-'+mo+'-'+dy
  }

  function buildDailyChart(data){
    var canvas = $('dailyChart'); if(!canvas || !window.Chart) return
    var days=[], labels=[]
    for(var i=13; i>=0; i--){
      var d = new Date(); d.setDate(d.getDate()-i)
      days.push(localDate(d))
      labels.push(d.toLocaleDateString('en-PH',{month:'short',day:'numeric'}))
    }
    var byDayIn = {}, byDayOut = {}
    data.filter(function(r){ return (r.status||'').toLowerCase()==='success' }).forEach(function(r){
      if(!r.created_at) return
      var day = localDate(r.created_at)
      if(r.type==='cash_in')  byDayIn[day]  = (byDayIn[day] ||0) + (Number(r.amount)||0)
      if(r.type==='cash_out') byDayOut[day] = (byDayOut[day]||0) + (Number(r.amount)||0)
    })
    var valsIn  = days.map(function(d){ return byDayIn[d] ||0 })
    var valsOut = days.map(function(d){ return byDayOut[d]||0 })
    var valsAll = days.map(function(d){ return (byDayIn[d]||0)+(byDayOut[d]||0) })
    if(dChart) dChart.destroy()
    dChart = new Chart(canvas, {
      type:'bar',
      data:{
        labels: labels,
        datasets:[
          { label:'Cash In',  data: valsIn,  backgroundColor:'rgba(76,110,245,.85)', borderRadius:4, borderSkipped:'bottom', barPercentage:0.95, categoryPercentage:0.5 },
          { label:'Cash Out', data: valsOut, backgroundColor:'rgba(239,68,68,.75)',  borderRadius:4, borderSkipped:'bottom', barPercentage:0.95, categoryPercentage:0.5 },
          { label:'All',      data: valsAll, backgroundColor:'rgba(34,197,94,.75)',  borderRadius:4, borderSkipped:'bottom', barPercentage:0.95, categoryPercentage:0.5 }
        ]
      },
      options: Object.assign({}, baseOpts, {
        onClick: function(evt, els){ if(els && els.length && window.showPage) window.showPage('customers') },
        onHover: function(e){ if(e.native) e.native.target.style.cursor='pointer' },
        plugins: Object.assign({}, baseOpts.plugins, {
          legend: { display:true, labels:{ color:'#6B7280', font:{size:12} } },
          tooltip: Object.assign({}, baseOpts.plugins.tooltip, {
            callbacks:{ label: function(c){ return ' '+c.dataset.label+': ₱'+c.parsed.y.toLocaleString('en-PH') } }
          })
        })
      })
    })
  }

  function buildMonthlyChart(data, year){
    var canvas = $('monthlyChart'); if(!canvas || !window.Chart) return
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    var byMIn = new Array(12).fill(0)
    var byMOut = new Array(12).fill(0)
    data.filter(function(r){ return (r.status||'').toLowerCase()==='success' }).forEach(function(r){
      if(!r.created_at) return
      var d = new Date(r.created_at)
      if(d.getFullYear() === year){
        if(r.type==='cash_in')  byMIn[d.getMonth()]  += (Number(r.amount)||0)
        if(r.type==='cash_out') byMOut[d.getMonth()] += (Number(r.amount)||0)
      }
    })
    var byMAll = byMIn.map(function(v,i){ return v + byMOut[i] })
    if(mChart) mChart.destroy()
    mChart = new Chart(canvas, {
      type:'bar',
      data:{
        labels: months,
        datasets:[
          { label:'Cash In',  data: byMIn,  backgroundColor:'rgba(76,110,245,.85)', borderRadius:4, borderSkipped:'bottom', barPercentage:0.95, categoryPercentage:0.5 },
          { label:'Cash Out', data: byMOut, backgroundColor:'rgba(239,68,68,.75)',  borderRadius:4, borderSkipped:'bottom', barPercentage:0.95, categoryPercentage:0.5 },
          { label:'All',      data: byMAll, backgroundColor:'rgba(34,197,94,.75)',  borderRadius:4, borderSkipped:'bottom', barPercentage:0.95, categoryPercentage:0.5 }
        ]
      },
      options: Object.assign({}, baseOpts, {
        onClick: function(evt, els){ if(els && els.length && window.showPage) window.showPage('customers') },
        onHover: function(e){ if(e.native) e.native.target.style.cursor='pointer' },
        plugins: Object.assign({}, baseOpts.plugins, {
          legend: { display:true, labels:{ color:'#6B7280', font:{size:12} } },
          tooltip: Object.assign({}, baseOpts.plugins.tooltip, {
            callbacks:{ label: function(c){ return ' '+c.dataset.label+': ₱'+c.parsed.y.toLocaleString('en-PH') } }
          })
        })
      })
    })
  }

  function buildYearSel(data){
    var sel = $('yearSel'); if(!sel) return
    var cur = new Date().getFullYear()
    var years = [cur]
    data.forEach(function(r){
      if(!r.created_at) return
      var y = new Date(r.created_at).getFullYear()
      if(!years.includes(y)) years.push(y)
    })
    years.sort(function(a,b){ return b-a })
    sel.innerHTML = years.map(function(y){
      return '<option value="'+y+'"'+(y===cur?' selected':'')+'>'+y+'</option>'
    }).join('')
    sel.addEventListener('change', function(){
      buildMonthlyChart(rows, parseInt(sel.value))
    })
  }

  // ── TABLE ──
  function filtered(){
    var r = rows
    if(typeFilter) r = r.filter(function(x){ return x.type === typeFilter })
    if(searchQ){
      var q = searchQ.toLowerCase()
      r = r.filter(function(x){
        return ['transaction_id','customer_name','type','status'].some(function(k){
          return x[k] && String(x[k]).toLowerCase().includes(q)
        })
      })
    }
    return r
  }

  function statusPill(status){
    var s = (status||'').toLowerCase()
    var cls = s==='success'?'pill-s' : s==='failed'?'pill-f' : s==='conflict'?'pill-c' : 'pill-p'
    var lbl = s ? s.charAt(0).toUpperCase()+s.slice(1) : 'Pending'
    return '<span class="pill '+cls+'">'+lbl+'</span>'
  }

  function typeChip(type){
    var lbl = type==='cash_in'?'Cash In' : type==='cash_out'?'Cash Out' : (type||'—')
    return '<span class="type-chip">'+lbl+'</span>'
  }

  function renderRows(){
    var tbody = $('txBody'); if(!tbody) return
    var f = filtered()
    var slice = f.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE)

    if(!slice.length){
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#9CA3AF;font-size:13px">No transactions found</td></tr>'
      updateFooter(f.length)
      return
    }

    tbody.innerHTML = slice.map(function(r){
      var enc = encodeURIComponent(JSON.stringify(r))
      return '<tr>'
        + '<td><strong>'+(r.transaction_id||'—')+'</strong></td>'
        + '<td>'+fmtDate(r.created_at)+'</td>'
        + '<td>'+(r.customer_name||'Walk-in')+'</td>'
        + '<td>'+typeChip(r.type)+'</td>'
        + '<td><strong>&#8369;'+money(r.amount)+'</strong></td>'
        + '<td>'+statusPill(r.status)+'</td>'
        + '<td class="row-actions">'
        + '<button class="view-btn" data-row="'+enc+'">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M1 12S5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>'
        + ' View</button>'
        + '<button class="del-btn" data-id="'+(r.id||'')+'">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>'
        + ' Delete</button>'
        + '</td>'
        + '</tr>'
    }).join('')

    tbody.querySelectorAll('.view-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        try{ openView(JSON.parse(decodeURIComponent(btn.dataset.row))) }
        catch(e){ toast('Error opening details','error') }
      })
    })

    tbody.querySelectorAll('.del-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        if(!currentUserIsAdmin()){
          toast('Only Admin can delete', 'error')
          return
        }
        var id = btn.dataset.id
        showConfirm('Delete Transaction?', 'This action cannot be undone.', function(){
          deleteRow(id)
        })
      })
    })

    updateFooter(f.length)
  }

  // ── CUSTOMER PAGE ──
  function cFiltered(){
    return rows.filter(function(r){
      if(cTypeFilter && r.type !== cTypeFilter) return false
      if(cStatusFilter && (r.status||'').toLowerCase() !== cStatusFilter) return false
      if(cSearchQ){
        var q = cSearchQ.toLowerCase()
        if(!(r.transaction_id||'').toLowerCase().includes(q) &&
           !(r.customer_name||'').toLowerCase().includes(q) &&
           !(String(r.amount||'')).includes(q)) return false
      }
      return true
    })
  }

  function renderCustomerRows(){
    var tbody = $('ctBody'); if(!tbody) return
    var f = cFiltered()
    var slice = f.slice((cPage-1)*PAGE_SIZE, cPage*PAGE_SIZE)

    if(!slice.length){
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#9CA3AF;font-size:13px">No transactions found</td></tr>'
      updateCtFooter(f.length)
      return
    }

    tbody.innerHTML = slice.map(function(r){
      var enc = encodeURIComponent(JSON.stringify(r))
      return '<tr>'
        + '<td><strong>'+(r.transaction_id||'—')+'</strong></td>'
        + '<td>'+fmtDate(r.created_at)+'</td>'
        + '<td>'+(r.customer_name||'Walk-in')+'</td>'
        + '<td>'+typeChip(r.type)+'</td>'
        + '<td><strong>&#8369;'+money(r.amount)+'</strong></td>'
        + '<td>'+statusPill(r.status)+'</td>'
        + '<td class="row-actions">'
        + '<button class="view-btn" data-row="'+enc+'">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M1 12S5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>'
        + ' View</button>'
        + '<button class="del-btn" data-id="'+(r.id||'')+'">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>'
        + ' Delete</button>'
        + '</td>'
        + '</tr>'
    }).join('')

    tbody.querySelectorAll('.view-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        try{ openView(JSON.parse(decodeURIComponent(btn.dataset.row))) }
        catch(e){ toast('Error opening details','error') }
      })
    })

    tbody.querySelectorAll('.del-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        if(!currentUserIsAdmin()){
          toast('Only Admin can delete', 'error')
          return
        }
        var id = btn.dataset.id
        showConfirm('Delete Transaction?', 'This action cannot be undone.', function(){
          deleteRow(id)
          renderCustomerRows()
        })
      })
    })

    updateCtFooter(f.length)
  }

  function updateCtFooter(totalLen){
    var pages = Math.max(1, Math.ceil(totalLen/PAGE_SIZE))
    var from = totalLen===0 ? 0 : (cPage-1)*PAGE_SIZE+1
    var to   = Math.min(cPage*PAGE_SIZE, totalLen)
    var info = $('ctInfo')
    if(info) info.textContent = 'Showing '+from+'–'+to+' of '+totalLen

    var pager = $('ctPager'); if(!pager) return
    if(pages <= 1){ pager.innerHTML=''; return }

    var html = '<button class="pg-btn" '+(cPage<=1?'disabled':'')+' data-p="'+(cPage-1)+'">&lsaquo;</button>'
    pageRange(cPage, pages).forEach(function(p){
      if(p==='…') html += '<button class="pg-btn" disabled>&hellip;</button>'
      else html += '<button class="pg-btn'+(p===cPage?' on':'')+' " data-p="'+p+'">'+p+'</button>'
    })
    html += '<button class="pg-btn" '+(cPage>=pages?'disabled':'')+' data-p="'+(cPage+1)+'">&rsaquo;</button>'
    pager.innerHTML = html

    pager.querySelectorAll('[data-p]:not([disabled])').forEach(function(btn){
      btn.addEventListener('click', function(){
        var p = parseInt(btn.dataset.p)
        var mx = Math.max(1, Math.ceil(cFiltered().length/PAGE_SIZE))
        if(p<1 || p>mx) return
        cPage = p; renderCustomerRows()
      })
    })
  }

  function updateFooter(totalLen){    var pages = Math.max(1, Math.ceil(totalLen/PAGE_SIZE))
    var from = totalLen===0 ? 0 : (page-1)*PAGE_SIZE+1
    var to   = Math.min(page*PAGE_SIZE, totalLen)
    var info = $('tblInfo')
    if(info) info.textContent = 'Showing '+from+'\u2013'+to+' of '+totalLen

    var pager = $('pager'); if(!pager) return
    if(pages <= 1){ pager.innerHTML=''; return }

    var html = '<button class="pg-btn" '+(page<=1?'disabled':'')+' data-p="'+(page-1)+'">&lsaquo;</button>'
    pageRange(page, pages).forEach(function(p){
      if(p==='…') html += '<button class="pg-btn" disabled>&hellip;</button>'
      else html += '<button class="pg-btn'+(p===page?' on':'')+'" data-p="'+p+'">'+p+'</button>'
    })
    html += '<button class="pg-btn" '+(page>=pages?'disabled':'')+' data-p="'+(page+1)+'">&rsaquo;</button>'
    pager.innerHTML = html

    pager.querySelectorAll('[data-p]:not([disabled])').forEach(function(btn){
      btn.addEventListener('click', function(){
        var p = parseInt(btn.dataset.p)
        var mx = Math.max(1, Math.ceil(filtered().length/PAGE_SIZE))
        if(p<1 || p>mx) return
        page = p; renderRows()
      })
    })
  }

  function pageRange(cur, tot){
    if(tot <= 7) return Array.from({length:tot}, function(_,i){ return i+1 })
    if(cur <= 4) return [1,2,3,4,5,'…',tot]
    if(cur >= tot-3) return [1,'…',tot-4,tot-3,tot-2,tot-1,tot]
    return [1,'…',cur-1,cur,cur+1,'…',tot]
  }

  function showSkeletons(){
    var tbody = $('txBody'); if(!tbody) return
    tbody.innerHTML = Array(5).fill(
      '<tr class="sk-row"><td colspan="7"><div class="sk"></div></td></tr>'
    ).join('')
  }

  // ── LOAD ──
  async function loadTransactions(){
    showSkeletons()
    try{
      if(window.electronAPI && window.electronAPI.db){
        var data = await window.electronAPI.db.getTransactions({page:1, pageSize:5000})
        rows = (data && data.rows && data.rows.length) ? data.rows : sampleRows()
      } else {
        rows = sampleRows()
      }
    }catch(e){
      console.error('loadTxns', e)
      rows = sampleRows()
    }
    buildYearSel(rows)
    buildDailyChart(rows)
    buildMonthlyChart(rows, new Date().getFullYear())
    page = 1
    renderRows()
    cPage = 1
    renderCustomerRows()
    if(typeof window._refreshAuxPages === 'function') window._refreshAuxPages()
  }

  // ── DELETE ──
  async function deleteRow(id){
    try{
      var deletedRow = rows.find(function(r){ return String(r.id) === String(id) })
      if(window.electronAPI && window.electronAPI.db){
        await window.electronAPI.db.deleteTransaction(id)
      }
      rows = rows.filter(function(r){ return String(r.id) !== String(id) })
      if(page > 1 && (page-1)*PAGE_SIZE >= filtered().length) page--
      renderRows()
      renderCustomerRows()
      buildDailyChart(rows)
      buildMonthlyChart(rows, parseInt($('yearSel') ? $('yearSel').value : new Date().getFullYear()))
      loadSummary()
      if(deletedRow) addTxnNotification(deletedRow, 'Transaction deleted')
      if(typeof window._refreshAuxPages === 'function') window._refreshAuxPages()
      toast('Transaction deleted','success')
    }catch(e){
      console.error('delete',e)
      toast('Failed to delete','error')
    }
  }

  // ── VIEW MODAL ──
  var _viewRow = null
  function openView(r){
    _viewRow = r
    var body = $('viewBody'); if(!body) return
    var isPending = (r.status||'').toLowerCase() === 'pending'
    body.innerHTML = '<div class="det-grid">'
      + '<div class="det-item"><div class="det-lbl">Reference Number</div><div class="det-val">'+(r.transaction_id||'—')+'</div></div>'
      + '<div class="det-item"><div class="det-lbl">Date &amp; Time</div><div class="det-val">'+fmtDateLong(r.created_at)+'</div></div>'
      + '<div class="det-item"><div class="det-lbl">Customer</div><div class="det-val">'+(r.customer_name||'Walk-in')+'</div></div>'
      + '<div class="det-item"><div class="det-lbl">Type</div><div class="det-val">'+typeChip(r.type)+'</div></div>'
      + '<div class="det-item"><div class="det-lbl">Amount</div><div class="det-val" style="font-size:20px;font-weight:700;color:#4C6EF5">&#8369;'+money(r.amount)+'</div></div>'
      + '<div class="det-item"><div class="det-lbl">Service Fee</div><div class="det-val" style="font-size:16px;font-weight:600;color:#F59E0B">&#8369;'+money(r.service_fee||0)+'<span style="font-size:11px;color:#9CA3AF;font-weight:400;margin-left:6px">not in totals</span></div></div>'
      + '<div class="det-item"><div class="det-lbl">Status</div><div class="det-val">'+statusPill(r.status)+'</div></div>'
      + '<div class="det-item"><div class="det-lbl">Sync Status</div><div class="det-val">'+(r.sync_status||'—')+'</div></div>'
      + '</div>'
        + '<div class="modal-ftr"><button class="btn btn-primary" id="saveTxnPdfBtn">Save as PDF</button></div>'
      + (isPending
          ? '<div class="det-update-bar">'
            + '<span class="det-update-lbl">Update Status:</span>'
            + '<button class="upd-btn upd-success" data-status="success">&#10003; Confirm / Success</button>'
            + '<button class="upd-btn upd-failed" data-status="failed">&#10007; Mark as Failed</button>'
            + '</div>'
          : '')
    // bind update buttons
    body.querySelectorAll('.upd-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var newStatus = btn.dataset.status
        showConfirm(
          newStatus==='success' ? 'Confirm Transaction?' : 'Mark as Failed?',
          newStatus==='success'
            ? 'This will mark the transaction as successful and include the amount in totals.'
            : 'This will mark the transaction as failed.',
          function(){ updateRowStatus(r, newStatus) },
          newStatus==='success' ? 'Confirm' : 'Mark as Failed',
          newStatus==='success' ? 'btn-primary' : 'btn-danger'
        )
      })
    })
    var pdfBtn = $('saveTxnPdfBtn')
    if(pdfBtn) pdfBtn.addEventListener('click', function(){ saveTransactionPdf(r, pdfBtn) })
    openOverlay('viewOverlay')
  }

  async function saveTransactionPdf(r, btn){
    if(!window.electronAPI || !window.electronAPI.pdf || !window.electronAPI.pdf.saveTransaction){
      toast('PDF export is unavailable', 'error')
      return
    }
    var oldText = btn ? btn.textContent : ''
    if(btn){ btn.disabled = true; btn.textContent = 'Saving PDF…' }
    try{
      var res = await window.electronAPI.pdf.saveTransaction(r)
      if(res && res.canceled) return
      if(!res || !res.success) throw new Error((res && res.error) || 'Failed to save PDF')
      toast('Transaction PDF saved', 'success')
    }catch(e){
      toast(e && e.message ? e.message : 'Failed to save PDF', 'error')
    }finally{
      if(btn){ btn.disabled = false; btn.textContent = oldText || 'Save as PDF' }
    }
  }

  async function updateRowStatus(r, newStatus){
    try{
      newStatus = (newStatus || '').toLowerCase()
      if(window.electronAPI && window.electronAPI.db){
        await window.electronAPI.db.updateTransaction(r.id, {
          status: newStatus,
          sync_status: newStatus === 'success' ? 'synced' : 'pending'
        })
      }
      // update in-memory
      var found = rows.find(function(x){ return String(x.id)===String(r.id) })
      if(found){
        found.status = newStatus
        found.sync_status = newStatus === 'success' ? 'synced' : 'pending'
      }
      r.status = newStatus
      r.sync_status = newStatus === 'success' ? 'synced' : 'pending'
      closeOverlay('viewOverlay')
      renderRows()
      renderCustomerRows()
      buildDailyChart(rows)
      buildMonthlyChart(rows, parseInt($('yearSel') ? $('yearSel').value : new Date().getFullYear()))
      await loadSummary()
      if(typeof window._renderDailyPage === 'function') window._renderDailyPage()
      if(typeof window._renderMonthlyPage === 'function') window._renderMonthlyPage()
      addTxnNotification(found || r, 'Transaction marked ' + newStatus)
      if(typeof window._refreshAuxPages === 'function') window._refreshAuxPages()
      toast('Status updated to ' + newStatus, 'success')
    }catch(e){
      console.error('updateStatus', e)
      toast('Failed to update status', 'error')
    }
  }

  // ── ADD MODAL ──
  async function submitAdd(e){
    e.preventDefault()
    var btn = e.target.querySelector('[type="submit"]')
    if(btn){ btn.disabled=true; btn.textContent='Saving…' }
    var tx = {
      type:         $('fType').value,
      amount:       parseFloat($('fAmount').value) || 0,
      service_fee:  parseFloat($('fServiceFee') ? $('fServiceFee').value : 0) || 0,
      status:       $('fStatus').value || 'success',
      sync_status:  ($('fStatus').value || 'success') === 'success' ? 'synced' : 'pending',
      created_at:   new Date().toISOString(),
      customer_name:($('fCustomer') && $('fCustomer').value.trim()) || 'Walk-in'
    }
    var txnId = $('fTxnId') ? $('fTxnId').value.trim() : ''
    if(txnId){
      if(!isValidReferenceNumber(txnId)){
        toast('Reference number must follow 8040-299-185593 format', 'error')
        if(btn){ btn.disabled=false; btn.textContent='Save Transaction' }
        return
      }
      if(rows.some(function(r){ return String(r.transaction_id) === txnId })){
        toast('Reference number already exists', 'error')
        if(btn){ btn.disabled=false; btn.textContent='Save Transaction' }
        return
      }
      tx.transaction_id = txnId
    }
    try{
      var res = null
      if(window.electronAPI && window.electronAPI.db){
        res = await window.electronAPI.db.addTransaction(tx)
      }
      if(res && res.success === false) throw new Error(res.error || 'Failed to add transaction')
      tx.id = (res && res.id) ? res.id : Date.now()
      tx.transaction_id = (res && res.transaction_id) ? res.transaction_id : (tx.transaction_id || '')
      rows.unshift(tx)
      closeOverlay('addOverlay')
      $('addForm').reset()
      page = 1; renderRows()
      buildDailyChart(rows)
      buildMonthlyChart(rows, new Date().getFullYear())
      loadSummary()
      addTxnNotification(tx, 'New transaction added')
      if(typeof window._refreshAuxPages === 'function') window._refreshAuxPages()
      toast('Transaction added!', 'success')
    }catch(err){
      console.error('addTxn', err)
      toast(err && err.message ? err.message : 'Failed to add transaction','error')
    }finally{
      if(btn){ btn.disabled=false; btn.textContent='Save Transaction' }
    }
  }

  // ── CONFIRM DIALOG ──
  var _confirmCb = null
  function showConfirm(title, msg, onOk, okLabel, okClass){
    var t = $('confirmTitle'), m = $('confirmMsg')
    if(t) t.textContent = title
    if(m) m.textContent = msg
    var okBtn = $('confirmOk')
    if(okBtn){
      okBtn.textContent = okLabel || 'Delete'
      okBtn.className = 'btn ' + (okClass || 'btn-danger')
    }
    _confirmCb = onOk
    openOverlay('confirmOverlay')
  }
  window._showConfirm = showConfirm

  // ── OVERLAYS ──
  function openOverlay(id){
    var el = $(id); if(!el) return
    el.classList.add('open')
    document.body.style.overflow = 'hidden'
  }
  function closeOverlay(id){
    var el = $(id); if(!el) return
    el.classList.remove('open')
    document.body.style.overflow = ''
  }
  window.closeOverlay = closeOverlay

  // ── SYNC ──
  async function updateSync(){
    try{
      var s = (window.electronAPI && window.electronAPI.sync)
               ? await window.electronAPI.sync.getStatus()
               : null
      var badge = $('syncBadge'), lbl = $('syncLabel')
      if(!badge || !lbl) return
      var settings = {}
      try { settings = JSON.parse(localStorage.getItem('gcashPosSettings')||'{}') } catch(e){}
      var online = (typeof settings.syncOverride === 'boolean') ? settings.syncOverride : (s && (s.message==='ok' || s.synced===true))
      badge.className = 'sync-badge ' + (online ? 'online' : 'offline')
      lbl.textContent  = online ? 'Online' : 'Offline'
      badge.title = 'Click to turn ' + (online ? 'Offline' : 'Online')
      if(typeof window._refreshAuxPages === 'function') window._refreshAuxPages()
    }catch(e){}
  }

  // ── BOOT ──
  document.addEventListener('DOMContentLoaded', function(){
    chartDefaults()
    // purge any leftover test data from the verification phase
    if(window.electronAPI && window.electronAPI.db && window.electronAPI.db.deleteTestData){
      window.electronAPI.db.deleteTestData()
    }
    loadSummary()
    loadTransactions()
    updateSync()
    setInterval(updateSync, 30000)

    ;['addTxnBtn','addTxnBtn2','addDailyBtn'].forEach(function(id){
      var el = $(id); if(el) el.addEventListener('click', function(){ openOverlay('addOverlay') })
    })

    var ac = $('addClose'); if(ac) ac.addEventListener('click', function(){ closeOverlay('addOverlay') })
    var ccl = $('addCancel'); if(ccl) ccl.addEventListener('click', function(){ closeOverlay('addOverlay') })
    var ao = $('addOverlay'); if(ao) ao.addEventListener('click', function(e){ if(e.target===ao) closeOverlay('addOverlay') })

    var vc = $('viewClose'); if(vc) vc.addEventListener('click', function(){ closeOverlay('viewOverlay') })
    var vo = $('viewOverlay'); if(vo) vo.addEventListener('click', function(e){ if(e.target===vo) closeOverlay('viewOverlay') })

    var af = $('addForm'); if(af) af.addEventListener('submit', submitAdd)
    var refInput = $('fTxnId'); if(refInput) refInput.addEventListener('input', function(){
      var digits = refInput.value.replace(/\D/g, '').slice(0, 13)
      var parts = []
      if(digits.slice(0, 4)) parts.push(digits.slice(0, 4))
      if(digits.slice(4, 7)) parts.push(digits.slice(4, 7))
      if(digits.slice(7, 13)) parts.push(digits.slice(7, 13))
      refInput.value = parts.join('-')
    })

    var rb = $('refreshBtn'); if(rb) rb.addEventListener('click', function(){ loadTransactions(); loadSummary(); toast('Refreshed','success') })

    // Customer page events
    var ctadd = $('ctAddBtn'); if(ctadd) ctadd.addEventListener('click', function(){ openOverlay('addOverlay') })
    var ctrf = $('ctRefreshBtn'); if(ctrf) ctrf.addEventListener('click', function(){ loadTransactions(); toast('Refreshed','success') })
    var cttf = $('ctTypeFilter'); if(cttf) cttf.addEventListener('change', function(){ cTypeFilter=cttf.value; cPage=1; renderCustomerRows() })
    var ctsf = $('ctStatusFilter'); if(ctsf) ctsf.addEventListener('change', function(){ cStatusFilter=ctsf.value; cPage=1; renderCustomerRows() })
    var ctsr = $('ctSearch'); if(ctsr) ctsr.addEventListener('input', function(){ cSearchQ=ctsr.value.trim(); cPage=1; renderCustomerRows() })

    var tf = $('typeFilter'); if(tf) tf.addEventListener('change', function(){ typeFilter=tf.value; page=1; renderRows() })

    var gs = $('globalSearch'); if(gs) gs.addEventListener('input', function(){ searchQ=gs.value.trim(); page=1; renderRows() })

    // ── DAILY SALES PAGE ──
    var dsDate = localDate(new Date())
    var dsTypeF = '', dsSearch = '', dsPage = 1, dsPageSize = 15, dsChart = null

    function fmtDSDate(d){ return new Date(d + 'T00:00:00').toLocaleDateString('en-PH',{weekday:'long',year:'numeric',month:'long',day:'numeric'}) }

    function renderDailyPage(){
      var dateRows = rows.filter(function(r){ return r.created_at && localDate(r.created_at) === dsDate })
      var successRows = dateRows.filter(function(r){ return (r.status||'').toLowerCase()==='success' })
      var cashIn    = successRows.filter(function(r){ return r.type==='cash_in' }).reduce(function(s,r){ return s+(Number(r.amount)||0) },0)
      var cashOut   = successRows.filter(function(r){ return r.type==='cash_out' }).reduce(function(s,r){ return s+(Number(r.amount)||0) },0)
      var svcFee    = successRows.reduce(function(s,r){ return s+(Number(r.service_fee)||0) },0)
      var inCount   = successRows.filter(function(r){ return r.type==='cash_in' }).length
      var outCount  = successRows.filter(function(r){ return r.type==='cash_out' }).length
      setText('dsCashIn',     '₱'+money(cashIn))
      setText('dsCashOut',    '₱'+money(cashOut))
      setText('dsNet',        '₱'+money(cashIn+cashOut))
      setText('dsServiceFee', '₱'+money(svcFee))
      var cic = $('dsCashInCount');  if(cic)  cic.textContent  = inCount+' transaction'+(inCount===1?'':'s')
      var coc = $('dsCashOutCount'); if(coc)  coc.textContent  = outCount+' transaction'+(outCount===1?'':'s')
      var ttl = $('dsTxnTotal');     if(ttl)  ttl.textContent  = dateRows.length+' total transaction'+(dateRows.length===1?'':'s')
      var sub = $('dsSub');          if(sub)  sub.textContent  = fmtDSDate(dsDate)
      var ttlbl = $('dsTblTitle');   if(ttlbl) ttlbl.textContent = 'Transactions — '+fmtDSDate(dsDate)
      var dp = $('dsDatePicker');    if(dp) dp.value = dsDate

      // filter table
      var tblRows = dateRows
      if(dsTypeF) tblRows = tblRows.filter(function(r){ return r.type===dsTypeF })
      if(dsSearch){ var q=dsSearch.toLowerCase(); tblRows=tblRows.filter(function(r){ return (r.transaction_id||'').toLowerCase().includes(q)||(r.customer_name||'').toLowerCase().includes(q) }) }
      var total = tblRows.length
      var totalPages = Math.max(1, Math.ceil(total/dsPageSize))
      if(dsPage > totalPages) dsPage = totalPages
      var slice = tblRows.slice((dsPage-1)*dsPageSize, dsPage*dsPageSize)
      var body = $('dsBody')
      if(body){
        body.innerHTML = slice.length ? slice.map(function(r){
          var ts = r.created_at ? new Date(r.created_at).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit',hour12:true}) : '—'
          var typeColor = r.type==='cash_in' ? '#4C6EF5' : '#EF4444'
          var typeLbl   = r.type==='cash_in' ? 'Cash In' : 'Cash Out'
          var statusCls = {success:'badge-success',pending:'badge-pending',failed:'badge-failed'}[r.status||''] || 'badge-pending'
          var sf = Number(r.service_fee)||0
          var enc = encodeURIComponent(JSON.stringify(r))
          return '<tr>'+
            '<td><span class="txn-id">'+(r.transaction_id||'—')+'</span></td>'+
            '<td style="color:#64748b;font-size:12px;">'+ts+'</td>'+
            '<td>'+(r.customer_name||'Walk-in')+'</td>'+
            '<td><span style="color:'+typeColor+';font-weight:600;font-size:12px;">'+typeLbl+'</span></td>'+
            '<td style="font-weight:600;">₱'+money(Number(r.amount)||0)+'</td>'+
            '<td style="color:#F59E0B;font-size:12px;">'+(sf>0?'₱'+money(sf):'—')+'</td>'+
            '<td><span class="badge '+statusCls+'">'+(r.status||'pending')+'</span></td>'+
            '<td><button class="view-btn ds-view-btn" data-row="'+enc+'">'+
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M1 12S5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>'+
            ' View</button></td>'+
            '</tr>'
        }).join('') : '<tr><td colspan="8" style="text-align:center;padding:32px;color:#94a3b8;">No transactions for this date</td></tr>'
        body.querySelectorAll('.ds-view-btn').forEach(function(btn){
          btn.addEventListener('click', function(){
            try{ openView(JSON.parse(decodeURIComponent(btn.dataset.row))) }
            catch(e){ toast('Error opening details','error') }
          })
        })
      }
      var info = $('dsInfo'); if(info) info.textContent = 'Showing '+(slice.length)+' of '+total
      // pager — hide when only 1 page
      var pagerEl = $('dsPager')
      if(pagerEl){
        if(totalPages <= 1){ pagerEl.innerHTML = ''; }
        else {
          var btns = ''
          for(var pp=1; pp<=totalPages; pp++){
            btns += '<button class="pg-btn'+(pp===dsPage?' on':'')+'" data-p="'+pp+'">'+pp+'</button>'
          }
          pagerEl.innerHTML = btns
          pagerEl.querySelectorAll('.pg-btn').forEach(function(b){ b.addEventListener('click', function(){ dsPage=parseInt(b.dataset.p); renderDailyPage() }) })
        }
      }

      // 14-day trend chart
      buildDSTrendChart()
    }

    function buildDSTrendChart(){
      var canvas = $('dsChart'); if(!canvas || !window.Chart) return
      var days=[], labels=[]
      for(var i=13; i>=0; i--){
        var d = new Date(); d.setDate(d.getDate()-i)
        days.push(localDate(d))
        labels.push(d.toLocaleDateString('en-PH',{month:'short',day:'numeric'}))
      }
      var byIn={}, byOut={}
      rows.filter(function(r){ return (r.status||'').toLowerCase()==='success' }).forEach(function(r){
        if(!r.created_at) return
        var day = localDate(r.created_at)
        if(r.type==='cash_in')  byIn[day]  = (byIn[day] ||0)+(Number(r.amount)||0)
        if(r.type==='cash_out') byOut[day] = (byOut[day]||0)+(Number(r.amount)||0)
      })
      var vIn  = days.map(function(d){ return byIn[d] ||0 })
      var vOut = days.map(function(d){ return byOut[d]||0 })
      // highlight selected day
      var bgIn  = days.map(function(d){ return d===dsDate ? 'rgba(76,110,245,1)'   : 'rgba(76,110,245,.55)' })
      var bgOut = days.map(function(d){ return d===dsDate ? 'rgba(239,68,68,1)'    : 'rgba(239,68,68,.45)' })
      if(dsChart) dsChart.destroy()
      dsChart = new Chart(canvas, {
        type:'bar',
        data:{ labels:labels, datasets:[
          { label:'Cash In',  data:vIn,  backgroundColor:bgIn,  borderRadius:4, borderSkipped:'bottom', barPercentage:0.9, categoryPercentage:0.55 },
          { label:'Cash Out', data:vOut, backgroundColor:bgOut, borderRadius:4, borderSkipped:'bottom', barPercentage:0.9, categoryPercentage:0.55 }
        ]},
        options: Object.assign({}, baseOpts, {
          onClick: function(evt, els){
            if(els && els.length){
              var idx = els[0].index
              dsDate = days[idx]
              dsPage = 1
              renderDailyPage()
            }
          },
          onHover: function(e){ if(e.native) e.native.target.style.cursor='pointer' },
          plugins: Object.assign({}, baseOpts.plugins, {
            legend:{ display:true, labels:{ color:'#6B7280', font:{size:12} } },
            tooltip: Object.assign({}, baseOpts.plugins.tooltip, {
              callbacks:{ label: function(c){ return ' '+c.dataset.label+': ₱'+c.parsed.y.toLocaleString('en-PH') } }
            })
          })
        })
      })
    }

    // wire Daily Sales controls
    ;(function(){
      window._renderDailyPage = renderDailyPage
      var picker = $('dsDatePicker')
      if(picker){ picker.value = dsDate; picker.addEventListener('change', function(){ dsDate=picker.value; dsPage=1; renderDailyPage() }) }
      var prev = $('dsPrevDay'); if(prev) prev.addEventListener('click', function(){
        var d=new Date(dsDate+'T00:00:00'); d.setDate(d.getDate()-1); dsDate=localDate(d); dsPage=1; renderDailyPage()
      })
      var next = $('dsNextDay'); if(next) next.addEventListener('click', function(){
        var d=new Date(dsDate+'T00:00:00'); d.setDate(d.getDate()+1); dsDate=localDate(d); dsPage=1; renderDailyPage()
      })
      var tod = $('dsTodayBtn'); if(tod) tod.addEventListener('click', function(){ dsDate=localDate(new Date()); dsPage=1; renderDailyPage() })
      var dst = $('dsTypeFilter'); if(dst) dst.addEventListener('change', function(){ dsTypeF=dst.value; dsPage=1; renderDailyPage() })
      var dss = $('dsSearch'); if(dss) dss.addEventListener('input', function(){ dsSearch=dss.value.trim(); dsPage=1; renderDailyPage() })
    })()

    // re-render daily page when data loads
    var _origLoadTx = loadTransactions
    loadTransactions = async function(){
      await _origLoadTx()
      renderDailyPage()
      buildMSYearSel(); buildMSMonthTabs(); renderMonthlyPage()
      if(typeof window._refreshAuxPages === 'function') window._refreshAuxPages()
    }

    // ── MONTHLY SALES PAGE ──
    var msMonthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']
    var msShort      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    var msYear  = new Date().getFullYear()
    var msMonth = new Date().getMonth() // 0-based
    var msTypeF = '', msSearch = '', msPage = 1, msPageSize = 15, msChartInst = null

    function buildMSYearSel(){
      var sel = $('msYearSel'); if(!sel) return
      var years = [msYear]
      rows.forEach(function(r){ if(!r.created_at) return; var y=new Date(r.created_at).getFullYear(); if(!years.includes(y)) years.push(y) })
      years.sort(function(a,b){ return b-a })
      sel.innerHTML = years.map(function(y){ return '<option value="'+y+'"'+(y===msYear?' selected':'')+'>'+y+'</option>' }).join('')
    }

    function buildMSMonthTabs(){
      var cont = $('msMonthTabs'); if(!cont) return
      cont.innerHTML = msShort.map(function(m,i){
        return '<button class="ms-month-btn'+(i===msMonth?' active':'')+'" data-m="'+i+'">'+m+'</button>'
      }).join('')
      cont.querySelectorAll('.ms-month-btn').forEach(function(b){
        b.addEventListener('click', function(){ msMonth=parseInt(b.dataset.m); msPage=1; renderMonthlyPage() })
      })
    }

    function renderMonthlyPage(){
      var monthStr = msYear+'-'+String(msMonth+1).padStart(2,'0')
      var monthRows = rows.filter(function(r){
        if(!r.created_at) return false
        var d = new Date(r.created_at)
        return d.getFullYear()===msYear && d.getMonth()===msMonth
      })
      var successRows = monthRows.filter(function(r){ return (r.status||'').toLowerCase()==='success' })
      var cashIn  = successRows.filter(function(r){ return r.type==='cash_in'  }).reduce(function(s,r){ return s+(Number(r.amount)||0) },0)
      var cashOut = successRows.filter(function(r){ return r.type==='cash_out' }).reduce(function(s,r){ return s+(Number(r.amount)||0) },0)
      var svcFee  = successRows.reduce(function(s,r){ return s+(Number(r.service_fee)||0) },0)
      var inCnt   = successRows.filter(function(r){ return r.type==='cash_in'  }).length
      var outCnt  = successRows.filter(function(r){ return r.type==='cash_out' }).length
      var lbl = msMonthNames[msMonth]+' '+msYear

      setText('msCashIn',    '₱'+money(cashIn))
      setText('msCashOut',   '₱'+money(cashOut))
      setText('msNet',       '₱'+money(cashIn+cashOut))
      setText('msServiceFee','₱'+money(svcFee))
      var lic=$('msLblIn');  if(lic)  lic.textContent  = 'Cash In \u2014 '+msShort[msMonth]
      var loc=$('msLblOut'); if(loc)  loc.textContent  = 'Cash Out \u2014 '+msShort[msMonth]
      var lnc=$('msLblNet'); if(lnc)  lnc.textContent  = 'Net \u2014 '+msShort[msMonth]
      var lsc=$('msLblSF');  if(lsc)  lsc.textContent  = 'Service Fee \u2014 '+msShort[msMonth]
      var cic=$('msCashInCount');  if(cic) cic.textContent = inCnt+' transaction'+(inCnt===1?'':'s')
      var coc=$('msCashOutCount'); if(coc) coc.textContent = outCnt+' transaction'+(outCnt===1?'':'s')
      var ttl=$('msTxnTotal');     if(ttl) ttl.textContent = monthRows.length+' total transaction'+(monthRows.length===1?'':'s')
      var sub=$('msSub');          if(sub) sub.textContent = lbl
      var ttlbl=$('msTblTitle');   if(ttlbl) ttlbl.textContent = 'Transactions \u2014 '+lbl
      var cttl=$('msChartTitle');  if(cttl) cttl.textContent  = msYear+' Year Overview'

      // update active tab
      var tabs = document.querySelectorAll('.ms-month-btn')
      tabs.forEach(function(b){ b.classList.toggle('active', parseInt(b.dataset.m)===msMonth) })

      // filter table
      var tblRows = monthRows
      if(msTypeF) tblRows = tblRows.filter(function(r){ return r.type===msTypeF })
      if(msSearch){ var q=msSearch.toLowerCase(); tblRows=tblRows.filter(function(r){ return (r.transaction_id||'').toLowerCase().includes(q)||(r.customer_name||'').toLowerCase().includes(q) }) }
      var total = tblRows.length
      var totalPages = Math.max(1, Math.ceil(total/msPageSize))
      if(msPage > totalPages) msPage = totalPages
      var slice = tblRows.slice((msPage-1)*msPageSize, msPage*msPageSize)
      var body = $('msBody')
      if(body){
        body.innerHTML = slice.length ? slice.map(function(r){
          var dateLbl = r.created_at ? new Date(r.created_at).toLocaleDateString('en-PH',{month:'short',day:'numeric'}) : '—'
          var ts      = r.created_at ? new Date(r.created_at).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit',hour12:true}) : ''
          var typeColor = r.type==='cash_in' ? '#4C6EF5' : '#EF4444'
          var typeLbl   = r.type==='cash_in' ? 'Cash In' : 'Cash Out'
          var statusCls = {success:'badge-success',pending:'badge-pending',failed:'badge-failed'}[r.status||''] || 'badge-pending'
          var sf = Number(r.service_fee)||0
          var enc = encodeURIComponent(JSON.stringify(r))
          return '<tr>'+
            '<td><span class="txn-id">'+(r.transaction_id||'—')+'</span></td>'+
            '<td style="color:#64748b;font-size:12px;">'+dateLbl+(ts?' · '+ts:'')+'</td>'+
            '<td>'+(r.customer_name||'Walk-in')+'</td>'+
            '<td><span style="color:'+typeColor+';font-weight:600;font-size:12px;">'+typeLbl+'</span></td>'+
            '<td style="font-weight:600;">₱'+money(Number(r.amount)||0)+'</td>'+
            '<td style="color:#F59E0B;font-size:12px;">'+(sf>0?'₱'+money(sf):'—')+'</td>'+
            '<td><span class="badge '+statusCls+'">'+(r.status||'pending')+'</span></td>'+
            '<td><button class="view-btn ms-view-btn" data-row="'+enc+'">'+
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M1 12S5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>'+
            ' View</button></td>'+
            '</tr>'
        }).join('') : '<tr><td colspan="8" style="text-align:center;padding:32px;color:#94a3b8;">No transactions for this month</td></tr>'
        body.querySelectorAll('.ms-view-btn').forEach(function(btn){
          btn.addEventListener('click', function(){
            try{ openView(JSON.parse(decodeURIComponent(btn.dataset.row))) }
            catch(e){ toast('Error opening details','error') }
          })
        })
      }
      var info = $('msInfo'); if(info) info.textContent = 'Showing '+slice.length+' of '+total
      var pagerEl = $('msPager')
      if(pagerEl){
        if(totalPages <= 1){ pagerEl.innerHTML = '' }
        else {
          var btns = ''
          for(var pp=1; pp<=totalPages; pp++){
            btns += '<button class="pg-btn'+(pp===msPage?' on':'')+'" data-p="'+pp+'">'+pp+'</button>'
          }
          pagerEl.innerHTML = btns
          pagerEl.querySelectorAll('.pg-btn').forEach(function(b){ b.addEventListener('click', function(){ msPage=parseInt(b.dataset.p); renderMonthlyPage() }) })
        }
      }
      buildMSChart()
    }

    function buildMSChart(){
      var canvas = $('msChart'); if(!canvas || !window.Chart) return
      var byIn = new Array(12).fill(0), byOut = new Array(12).fill(0)
      rows.filter(function(r){ return (r.status||'').toLowerCase()==='success' && r.created_at && new Date(r.created_at).getFullYear()===msYear }).forEach(function(r){
        var m = new Date(r.created_at).getMonth()
        if(r.type==='cash_in')  byIn[m]  += Number(r.amount)||0
        if(r.type==='cash_out') byOut[m] += Number(r.amount)||0
      })
      var bgIn  = byIn.map(function(_,i){  return i===msMonth ? 'rgba(76,110,245,1)'  : 'rgba(76,110,245,.5)'  })
      var bgOut = byOut.map(function(_,i){ return i===msMonth ? 'rgba(239,68,68,1)'   : 'rgba(239,68,68,.45)' })
      if(msChartInst) msChartInst.destroy()
      msChartInst = new Chart(canvas, {
        type:'bar',
        data:{ labels: msShort, datasets:[
          { label:'Cash In',  data:byIn,  backgroundColor:bgIn,  borderRadius:4, borderSkipped:'bottom', barPercentage:0.9, categoryPercentage:0.55 },
          { label:'Cash Out', data:byOut, backgroundColor:bgOut, borderRadius:4, borderSkipped:'bottom', barPercentage:0.9, categoryPercentage:0.55 }
        ]},
        options: Object.assign({}, baseOpts, {
          onClick: function(evt, els){
            if(els && els.length){ msMonth = els[0].index; msPage=1; renderMonthlyPage() }
          },
          onHover: function(e){ if(e.native) e.native.target.style.cursor='pointer' },
          plugins: Object.assign({}, baseOpts.plugins, {
            legend:{ display:true, labels:{ color:'#6B7280', font:{size:12} } },
            tooltip: Object.assign({}, baseOpts.plugins.tooltip, {
              callbacks:{ label: function(c){ return ' '+c.dataset.label+': ₱'+c.parsed.y.toLocaleString('en-PH') } }
            })
          })
        })
      })
    }

    // wire monthly sales controls
    ;(function(){
      window._renderMonthlyPage = function(){ buildMSYearSel(); buildMSMonthTabs(); renderMonthlyPage() }
      var ySel = $('msYearSel')
      if(ySel) ySel.addEventListener('change', function(){ msYear=parseInt(ySel.value); msPage=1; renderMonthlyPage() })
      var prev = $('msPrevYear'); if(prev) prev.addEventListener('click', function(){ msYear--; buildMSYearSel(); msPage=1; renderMonthlyPage() })
      var next = $('msNextYear'); if(next) next.addEventListener('click', function(){ msYear++; buildMSYearSel(); msPage=1; renderMonthlyPage() })
      var mst = $('msTypeFilter'); if(mst) mst.addEventListener('change', function(){ msTypeF=mst.value; msPage=1; renderMonthlyPage() })
      var mss = $('msSearch'); if(mss) mss.addEventListener('input', function(){ msSearch=mss.value.trim(); msPage=1; renderMonthlyPage() })
    })()

    // ── REPORTS PAGE ──
    var reportRows = []

    function csvEscape(v){
      v = v == null ? '' : String(v)
      return '"' + v.replace(/"/g, '""') + '"'
    }

    function getReportRange(){
      var type = ($('reportType') && $('reportType').value) || 'daily'
      var now = new Date()
      var from = localDate(now)
      var to = localDate(now)
      if(type === 'monthly'){
        from = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-01'
        to = localDate(new Date(now.getFullYear(), now.getMonth()+1, 0))
      } else if(type === 'yearly'){
        from = now.getFullYear() + '-01-01'
        to = now.getFullYear() + '-12-31'
      } else if(type === 'custom'){
        from = ($('reportFrom') && $('reportFrom').value) || from
        to = ($('reportTo') && $('reportTo').value) || to
      }
      return { type:type, from:from, to:to }
    }

    function setReportPresetRange(){
      var range = getReportRange()
      var fromEl = $('reportFrom'), toEl = $('reportTo')
      if(fromEl) fromEl.value = range.from
      if(toEl) toEl.value = range.to
    }

    function syncReportInputs(){
      var range = getReportRange()
      var fromEl = $('reportFrom'), toEl = $('reportTo')
      if(fromEl && !fromEl.value) fromEl.value = range.from
      if(toEl && !toEl.value) toEl.value = range.to
    }

    function filteredReportRows(){
      syncReportInputs()
      var from = ($('reportFrom') && $('reportFrom').value) || localDate(new Date())
      var to = ($('reportTo') && $('reportTo').value) || from
      var status = $('reportStatus') ? $('reportStatus').value : 'success'
      return rows.filter(function(r){
        if(!r.created_at) return false
        var d = localDate(r.created_at)
        if(d < from || d > to) return false
        if(status && (r.status||'').toLowerCase() !== status) return false
        return true
      })
    }

    function renderReportsPage(){
      reportRows = filteredReportRows()
      syncReportEmailField(getSettings(), getCurrentUser())
      var successRows = reportRows.filter(function(r){ return (r.status||'').toLowerCase()==='success' })
      var totalRows = ($('reportStatus') && $('reportStatus').value) === 'success' ? reportRows : successRows
      var cashIn = totalRows.filter(function(r){ return r.type==='cash_in' }).reduce(function(s,r){ return s+(Number(r.amount)||0) },0)
      var cashOut = totalRows.filter(function(r){ return r.type==='cash_out' }).reduce(function(s,r){ return s+(Number(r.amount)||0) },0)
      var serviceFee = totalRows.reduce(function(s,r){ return s+(Number(r.service_fee)||0) },0)
      setText('reportCashIn', '₱'+money(cashIn))
      setText('reportCashOut', '₱'+money(cashOut))
      setText('reportNet', '₱'+money(cashIn+cashOut))
      setText('reportServiceFee', '₱'+money(serviceFee))

      var range = getReportRange()
      setText('reportTableTitle', 'Report Transactions — ' + range.from + ' to ' + range.to)
      setText('reportInfo', reportRows.length + ' record' + (reportRows.length===1?'':'s'))
      setText('reportRangePill', range.from === range.to ? range.from : (range.from + ' → ' + range.to))

      var counts = { success:0, pending:0, failed:0, cash_in:0, cash_out:0 }
      reportRows.forEach(function(r){
        var st = (r.status||'pending').toLowerCase()
        counts[st] = (counts[st]||0) + 1
        counts[r.type] = (counts[r.type]||0) + 1
      })
      var bd = $('reportBreakdown')
      if(bd){
        bd.innerHTML = '<div class="break-card"><span>Total Transactions</span><strong>'+reportRows.length+'</strong></div>'+
          '<div class="break-card"><span>Success</span><strong>'+counts.success+'</strong></div>'+
          '<div class="break-card"><span>Pending</span><strong>'+counts.pending+'</strong></div>'+
          '<div class="break-card"><span>Failed</span><strong>'+counts.failed+'</strong></div>'+
          '<div class="break-card"><span>Cash In Count</span><strong>'+counts.cash_in+'</strong></div>'+
          '<div class="break-card"><span>Cash Out Count</span><strong>'+counts.cash_out+'</strong></div>'
      }

      var body = $('reportBody')
      if(body){
        body.innerHTML = reportRows.length ? reportRows.map(function(r){
          return '<tr><td><strong>'+(r.transaction_id||'—')+'</strong></td><td>'+fmtDate(r.created_at)+'</td><td>'+(r.customer_name||'Walk-in')+'</td><td>'+typeChip(r.type)+'</td><td><strong>₱'+money(r.amount)+'</strong></td><td>₱'+money(r.service_fee||0)+'</td><td>'+statusPill(r.status)+'</td></tr>'
        }).join('') : '<tr><td colspan="7" style="text-align:center;padding:36px;color:#94a3b8;">No records for this report</td></tr>'
      }

      buildReportChart(reportRows)
    }

    function emailReport(){
      if(!currentUserIsAdmin()){
        toast('Only Admin can view or send report email', 'error')
        return
      }
      renderReportsPage()
      var emailEl = $('reportEmail')
      var email = emailEl ? emailEl.value.trim() : ''
      if(!email){ toast('Enter an email address first','error'); if(emailEl) emailEl.focus(); return }
      var s = getSettings()
      if(!s.smtpHost || !s.smtpUser || !s.smtpPass){
        toast('Complete SMTP settings first','error')
        if(window.showPage) window.showPage('settings')
        return
      }
      showActionConfirm(
        'Send Report via Email?',
        'Send this generated report to ' + email + '?',
        function(){ sendReportNow(email) },
        'Send Email',
        'btn-primary'
      )
    }

    function getReportTotals(){
      var successRows = reportRows.filter(function(r){ return (r.status||'').toLowerCase()==='success' })
      var cashIn = successRows.filter(function(r){ return r.type==='cash_in' }).reduce(function(sum,r){ return sum+(Number(r.amount)||0) },0)
      var cashOut = successRows.filter(function(r){ return r.type==='cash_out' }).reduce(function(sum,r){ return sum+(Number(r.amount)||0) },0)
      var serviceFee = successRows.reduce(function(sum,r){ return sum+(Number(r.service_fee)||0) },0)
      var totalAmount = cashIn + cashOut
      return { cashIn:cashIn, cashOut:cashOut, serviceFee:serviceFee, totalAmount:totalAmount, grandTotal:totalAmount + serviceFee }
    }

    async function sendReportNow(email){
      var s = getSettings()
      var range = getReportRange()
      var totals = getReportTotals()
      var payload = {
        to: email,
        smtp: {
          host: s.smtpHost,
          port: Number(s.smtpPort || 587),
          secure: String(s.smtpSecure) === 'true' || s.smtpSecure === true,
          user: s.smtpUser,
          pass: s.smtpPass,
          from: s.smtpFrom || s.smtpUser
        },
        report: {
          range: range,
          summary: {
            cashIn: money(totals.cashIn),
            cashOut: money(totals.cashOut),
            net: money(totals.totalAmount),
            serviceFee: money(totals.serviceFee),
            totalAmount: money(totals.totalAmount),
            grandTotal: money(totals.grandTotal)
          },
          rows: reportRows.map(function(r){
            return {
              transaction_id: r.transaction_id || '',
              created_at: fmtDateLong(r.created_at),
              customer_name: r.customer_name || 'Walk-in',
              type: r.type || '',
              amount: r.amount || 0,
              service_fee: r.service_fee || 0,
              status: r.status || ''
            }
          })
        }
      }
      try{
        toast('Report queued for ' + email, 'success')
        toast('Sending in background…', 'info')
        var res = window.electronAPI && window.electronAPI.email ? await window.electronAPI.email.sendReport(payload) : {success:false,error:'Email API unavailable'}
        if(res && res.success){
          toast('Report delivered to ' + email, 'success')
          addTxnNotification({ id:'email-'+Date.now(), transaction_id:'EMAIL-REPORT', customer_name:email, type:'report_email', amount:0, notificationText:'Report sent to ' + email }, 'Report email sent')
        } else {
          toast((res && res.error) ? res.error : 'Failed to send report', 'error')
        }
      }catch(err){
        toast(err && err.message ? err.message : 'Failed to send report', 'error')
      }
    }

    function buildReportChart(data){
      var canvas = $('reportChart'); if(!canvas || !window.Chart) return
      var range = getReportRange()
      var buckets = {}
      data.filter(function(r){ return (r.status||'').toLowerCase()==='success' }).forEach(function(r){
        var d = localDate(r.created_at)
        var key = range.type === 'yearly' ? d.slice(0,7) : d
        if(!buckets[key]) buckets[key] = { cash_in:0, cash_out:0 }
        if(r.type === 'cash_in') buckets[key].cash_in += Number(r.amount)||0
        if(r.type === 'cash_out') buckets[key].cash_out += Number(r.amount)||0
      })
      var keys = Object.keys(buckets).sort()
      if(!keys.length){ keys = [range.from]; buckets[range.from] = {cash_in:0, cash_out:0} }
      var labels = keys.map(function(k){
        return range.type === 'yearly' ? new Date(k+'-01T00:00:00').toLocaleDateString('en-PH',{month:'short'}) : new Date(k+'T00:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric'})
      })
      if(reportChart) reportChart.destroy()
      reportChart = new Chart(canvas, {
        type:'bar',
        data:{ labels:labels, datasets:[
          { label:'Cash In', data:keys.map(function(k){ return buckets[k].cash_in }), backgroundColor:'rgba(76,110,245,.85)', borderRadius:4 },
          { label:'Cash Out', data:keys.map(function(k){ return buckets[k].cash_out }), backgroundColor:'rgba(239,68,68,.75)', borderRadius:4 }
        ]},
        options:Object.assign({}, baseOpts, { plugins:Object.assign({}, baseOpts.plugins, { legend:{display:true, labels:{color:'#6B7280', font:{size:12}}} }) })
      })
    }

    function exportReportCsv(){
      renderReportsPage()
      var totals = getReportTotals()
      var lines = [['Reference Number','Date','Customer','Type','Amount','Service Fee','Status'].map(csvEscape).join(',')]
      reportRows.forEach(function(r){
        lines.push([r.transaction_id||'', fmtDateLong(r.created_at), r.customer_name||'Walk-in', r.type||'', r.amount||0, r.service_fee||0, r.status||''].map(csvEscape).join(','))
      })
      lines.push('')
      lines.push(['SUMMARY','','','','','',''].map(csvEscape).join(','))
      lines.push(['Cash In','','','',totals.cashIn,'',''].map(csvEscape).join(','))
      lines.push(['Cash Out','','','',totals.cashOut,'',''].map(csvEscape).join(','))
      lines.push(['Total Amount (Cash In + Cash Out)','','','',totals.totalAmount,'',''].map(csvEscape).join(','))
      lines.push(['Service Fee','','','',totals.serviceFee,'',''].map(csvEscape).join(','))
      lines.push(['GRAND TOTAL (Amount + Service Fee)','','','',totals.grandTotal,'',''].map(csvEscape).join(','))
      var blob = new Blob([lines.join('\n')], {type:'text/csv;charset=utf-8;'})
      var a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'gcash-pos-report-' + localDate(new Date()) + '.csv'
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(a.href)
      toast('Report exported','success')
    }

    ;(function(){
      window._renderReportsPage = renderReportsPage
      var rt = $('reportType'); if(rt) rt.addEventListener('change', function(){ setReportPresetRange(); renderReportsPage() })
      ;['reportFrom','reportTo'].forEach(function(id){ var el=$(id); if(el) el.addEventListener('change', function(){ var type=$('reportType'); if(type) type.value='custom'; renderReportsPage() }) })
      var rs = $('reportStatus'); if(rs) rs.addEventListener('change', renderReportsPage)
      var run = $('reportRunBtn'); if(run) run.addEventListener('click', function(){
        renderReportsPage()
        if($('reportEmail') && $('reportEmail').value.trim()) emailReport()
      })
      var exp = $('reportExportBtn'); if(exp) exp.addEventListener('click', exportReportCsv)
      var eml = $('reportEmailBtn'); if(eml) eml.addEventListener('click', emailReport)
      var prn = $('reportPrintBtn'); if(prn) prn.addEventListener('click', function(){ renderReportsPage(); window.print() })
      var email = $('reportEmail'); if(email){ var ss=getSettings(); syncReportEmailField(ss, getCurrentUser()) }
      setReportPresetRange()
    })()

    // ── STAFF ACCOUNTS PAGE ──
    var staffRows = []
    var staffSearch = ''
    var staffLoaded = false

    function staffRolePill(role){
      var r = (role || 'staff').toLowerCase()
      var cls = r === 'admin' ? 'pill-c' : 'pill-s'
      return '<span class="pill '+cls+'">'+(r === 'admin' ? 'Administrator' : 'Staff')+'</span>'
    }

    function staffStatusPill(status){
      var s = (status || 'active').toLowerCase()
      return '<span class="pill '+(s === 'active' ? 'pill-s' : 'pill-f')+'">'+(s === 'active' ? 'Active' : 'Inactive')+'</span>'
    }

    function filteredStaff(){
      var data = staffRows
      if(staffSearch){
        var q = staffSearch.toLowerCase()
        data = data.filter(function(u){
          return (u.username||'').toLowerCase().includes(q) ||
                 (u.full_name||'').toLowerCase().includes(q) ||
                 (u.role||'').toLowerCase().includes(q) ||
                 (u.status||'').toLowerCase().includes(q)
        })
      }
      return data
    }

    function renderStaffRows(){
      var body = $('staffBody')
      if(!body) return
      var data = filteredStaff()
      var active = staffRows.filter(function(u){ return (u.role||'staff').toLowerCase()==='staff' && (u.status||'active').toLowerCase()==='active' }).length
      var inactive = staffRows.filter(function(u){ return (u.status||'active').toLowerCase()==='inactive' }).length
      var admins = staffRows.filter(function(u){ return (u.role||'staff').toLowerCase()==='admin' }).length
      setText('staffTotal', staffRows.length)
      setText('staffActive', active)
      setText('staffInactive', inactive)
      setText('staffAdmins', admins)
      setText('staffInfo', data.length + ' account' + (data.length===1?'':'s'))
      if(!data.length){
        body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:#9CA3AF;font-size:13px">No staff accounts found</td></tr>'
        return
      }
      body.innerHTML = data.map(function(u){
        var enc = encodeURIComponent(JSON.stringify(u))
        var isAdmin = (u.role || '').toLowerCase() === 'admin'
        return '<tr>'+
          '<td><strong>'+esc(u.full_name || u.username || 'Staff User')+'</strong></td>'+
          '<td>'+esc(u.username || '—')+'</td>'+
          '<td>'+staffRolePill(u.role)+'</td>'+
          '<td>'+staffStatusPill(u.status)+'</td>'+
          '<td>'+fmtDate(u.created_at)+'</td>'+
          '<td class="row-actions staff-actions">'+
          '<button class="view-btn staff-edit-btn" data-row="'+enc+'">Edit</button>'+
          (isAdmin ? '<button class="del-btn staff-del-btn" disabled title="Administrator accounts cannot be deleted">Protected</button>' : '<button class="del-btn staff-del-btn" data-id="'+esc(u.id)+'">Delete</button>')+
          '</td>'+
          '</tr>'
      }).join('')
      body.querySelectorAll('.staff-edit-btn').forEach(function(btn){
        btn.addEventListener('click', function(){
          try { openStaffModal(JSON.parse(decodeURIComponent(btn.dataset.row))) }
          catch(e){ toast('Error opening staff account','error') }
        })
      })
      body.querySelectorAll('.staff-del-btn').forEach(function(btn){
        btn.addEventListener('click', function(){
          if(btn.disabled) return
          showConfirm('Delete Staff Account?', 'This staff login account will be removed permanently.', function(){ deleteStaff(btn.dataset.id) }, 'Delete', 'btn-danger')
        })
      })
    }

    async function loadStaff(){
      var body = $('staffBody')
      if(body) body.innerHTML = '<tr class="sk-row"><td colspan="6"><div class="sk"></div></td></tr>'
      try{
        staffRows = (window.electronAPI && window.electronAPI.staff) ? await window.electronAPI.staff.list({ search: '' }) : []
        staffLoaded = true
        renderStaffRows()
      }catch(e){
        console.error('loadStaff', e)
        staffRows = []
        renderStaffRows()
        toast('Failed to load staff accounts','error')
      }
    }

    function openStaffModal(row){
      var isEdit = !!(row && row.id)
      setText('staffModalTitle', isEdit ? 'Edit Staff Account' : 'Add Staff Account')
      var form = $('staffForm'); if(form) form.reset()
      if($('staffId')) $('staffId').value = isEdit ? row.id : ''
      if($('staffFullName')) $('staffFullName').value = isEdit ? (row.full_name || '') : ''
      if($('staffUsername')) $('staffUsername').value = isEdit ? (row.username || '') : ''
      if($('staffPassword')) {
        $('staffPassword').value = ''
        $('staffPassword').required = !isEdit
        $('staffPassword').placeholder = isEdit ? 'Leave blank to keep current password' : 'Minimum 6 characters'
      }
      if($('staffRole')) $('staffRole').value = (isEdit && row.role === 'admin') ? 'admin' : 'staff'
      if($('staffStatus')) $('staffStatus').value = (isEdit && row.status === 'inactive') ? 'inactive' : 'active'
      openOverlay('staffOverlay')
    }

    async function submitStaff(e){
      e.preventDefault()
      var id = $('staffId') ? $('staffId').value : ''
      var payload = {
        full_name: $('staffFullName') ? $('staffFullName').value.trim() : '',
        username: $('staffUsername') ? $('staffUsername').value.trim() : '',
        password: $('staffPassword') ? $('staffPassword').value : '',
        role: $('staffRole') ? $('staffRole').value : 'staff',
        status: $('staffStatus') ? $('staffStatus').value : 'active'
      }
      if(!payload.full_name){ toast('Full name is required','error'); return }
      if(!payload.username){ toast('Username is required','error'); return }
      if(!id && (!payload.password || payload.password.length < 6)){ toast('Password must be at least 6 characters','error'); return }
      var btn = $('staffSaveBtn')
      if(btn){ btn.disabled = true; btn.textContent = 'Saving…' }
      try{
        var res = id
          ? await window.electronAPI.staff.update(id, payload)
          : await window.electronAPI.staff.create(payload)
        if(!res || !res.success) throw new Error((res && res.error) || 'Unable to save staff account')
        closeOverlay('staffOverlay')
        await loadStaff()
        toast(id ? 'Staff account updated' : 'Staff account added', 'success')
      }catch(err){
        toast(err && err.message ? err.message : 'Failed to save staff account', 'error')
      }finally{
        if(btn){ btn.disabled = false; btn.textContent = 'Save Account' }
      }
    }

    async function deleteStaff(id){
      try{
        var res = await window.electronAPI.staff.delete(id)
        if(!res || !res.success) throw new Error((res && res.error) || 'Unable to delete staff account')
        await loadStaff()
        toast('Staff account deleted','success')
      }catch(err){
        toast(err && err.message ? err.message : 'Failed to delete staff account','error')
      }
    }

    ;(function(){
      window._renderStaffPage = function(){ if(!staffLoaded) loadStaff(); else renderStaffRows() }
      var add = $('staffAddBtn'); if(add) add.addEventListener('click', function(){ openStaffModal(null) })
      var refresh = $('staffRefreshBtn'); if(refresh) refresh.addEventListener('click', function(){ loadStaff(); toast('Staff refreshed','success') })
      var search = $('staffSearch'); if(search) search.addEventListener('input', function(){ staffSearch = search.value.trim(); renderStaffRows() })
      var form = $('staffForm'); if(form) form.addEventListener('submit', submitStaff)
      var close = $('staffClose'); if(close) close.addEventListener('click', function(){ closeOverlay('staffOverlay') })
      var cancel = $('staffCancel'); if(cancel) cancel.addEventListener('click', function(){ closeOverlay('staffOverlay') })
      var overlay = $('staffOverlay'); if(overlay) overlay.addEventListener('click', function(e){ if(e.target===overlay) closeOverlay('staffOverlay') })
    })()

    // ── SETTINGS / PROFILE / NOTIFICATIONS / ABOUT ──
    var defaultSettings = {
      businessName:'GCash POS', branch:'Main Branch', receiptFooter:'Thank you for your transaction', defaultFee:'0',
      profileName:'POS User', profileRole:'POS Administrator', profileEmail:'admin@gcashpos.local', profileInitials:'PU',
      profilePhoto:'', reportEmail:'', smtpHost:'smtp.gmail.com', smtpPort:'587', smtpUser:'', smtpFrom:'', smtpPass:'', smtpSecure:'false', compact:false, notifDot:true, autoRefresh:false, syncOverride:null
    }

    function getSettings(){
      var s
      try { s = Object.assign({}, defaultSettings, JSON.parse(localStorage.getItem('gcashPosSettings')||'{}')) }
      catch(e){ s = Object.assign({}, defaultSettings) }
      if(!s.reportEmail || s.reportEmail === 'admin@gcashpos.local') s.reportEmail = s.profileEmail || defaultSettings.profileEmail
      return s
    }

    function getCurrentUser(){
      try { return JSON.parse(localStorage.getItem('gcashPosCurrentUser') || '{}') }
      catch(e){ return {} }
    }

    function isAdminUser(user){
      return ((user || getCurrentUser()).role || '').toLowerCase() === 'admin'
    }

    function getDisplayProfile(s, currentUser){
      currentUser = currentUser || getCurrentUser()
      var admin = isAdminUser(currentUser)
      var name = admin
        ? (s.profileName || currentUser.full_name || currentUser.username || 'Administrator')
        : (currentUser.full_name || currentUser.username || 'Staff User')
      var role = admin ? 'POS Administrator' : 'POS Staff'
      return {
        profileName: name,
        profileRole: role,
        profileInitials: admin ? (s.profileInitials || initialsFromName(name)) : initialsFromName(name),
        profilePhoto: admin ? (s.profilePhoto || '') : ''
      }
    }

    function syncReportEmailField(s, currentUser){
      var emailEl = $('reportEmail')
      if(!emailEl) return
      currentUser = currentUser || getCurrentUser()
      var admin = isAdminUser(currentUser)
      if(admin){
        emailEl.disabled = false
        emailEl.type = 'email'
        emailEl.title = ''
        emailEl.placeholder = 'receiver@email.com'
        if(!emailEl.value || emailEl.value === '············' || emailEl.value === 'admin@gcashpos.local') emailEl.value = s.reportEmail || s.profileEmail || ''
      } else {
        emailEl.type = 'text'
        emailEl.value = '············'
        emailEl.placeholder = '············'
        emailEl.disabled = true
        emailEl.title = 'Only admin can view or edit this email'
      }
    }

    function saveSettingsObj(s){ localStorage.setItem('gcashPosSettings', JSON.stringify(s)) }

    function initialsFromName(name){
      return String(name||'').split(/\s+/).filter(Boolean).slice(0,2).map(function(p){ return p.charAt(0).toUpperCase() }).join('') || 'DR'
    }

    function setAvatarVisual(el, s){
      if(!el) return
      var initials = s.profileInitials || initialsFromName(s.profileName)
      if(s.profilePhoto){
        el.style.backgroundImage = 'url(' + s.profilePhoto + ')'
        el.classList.add('has-photo')
        el.textContent = initials
      } else {
        el.style.backgroundImage = ''
        el.classList.remove('has-photo')
        el.textContent = initials
      }
    }

    function applySettings(){
      var s = getSettings()
      var currentUser = getCurrentUser()
      var display = getDisplayProfile(s, currentUser)
      var admin = isAdminUser(currentUser)
      document.body.classList.toggle('compact-mode', !!s.compact)
      setText('profileNameTop', display.profileName)
      setText('profileNameMenu', display.profileName)
      setText('profileRoleMenu', display.profileRole)
      setAvatarVisual($('profileAvatar'), display)
      setAvatarVisual($('profileAvatarMenu'), display)
      setAvatarVisual($('profilePhotoPreview'), display)
      var dashSub = document.querySelector('#page-dashboard .page-sub')
      if(dashSub) dashSub.textContent = 'Welcome back, ' + display.profileName
      document.querySelectorAll('.nav-item[data-page="staff"], .nav-item[data-page="settings"], .nav-item[data-page="about"]').forEach(function(item){ item.style.display = admin ? '' : 'none' })
      ;['profileSettingsBtn','profileAboutBtn'].forEach(function(id){ var el=$(id); if(el) el.style.display = admin ? '' : 'none' })
      var activePage = document.querySelector('.page.active')
      if(!admin && activePage && ['page-staff','page-settings','page-about'].includes(activePage.id) && window.showPage) window.showPage('dashboard')
      var fee = $('fServiceFee')
      if(fee && !fee.value) fee.value = s.defaultFee || '0'
      syncReportEmailField(s, currentUser)
      updateNotifications()
    }

    function renderSettingsPage(){
      var s = getSettings()
      var currentUser = getCurrentUser()
      var admin = isAdminUser(currentUser)
      var display = getDisplayProfile(s, currentUser)
      ;[['setBusinessName','businessName'],['setBranch','branch'],['setReceiptFooter','receiptFooter'],['setDefaultFee','defaultFee'],['setSmtpHost','smtpHost'],['setSmtpPort','smtpPort'],['setSmtpUser','smtpUser'],['setSmtpFrom','smtpFrom'],['setSmtpPass','smtpPass']].forEach(function(pair){ var el=$(pair[0]); if(el) el.value = s[pair[1]] || '' })
      ;[['setProfileName', admin ? s.profileName : display.profileName],['setProfileRole', display.profileRole],['setProfileEmail', admin ? s.profileEmail : ''],['setProfileInitials', display.profileInitials]].forEach(function(pair){ var el=$(pair[0]); if(el) el.value = pair[1] || '' })
      ;['setProfileName','setProfileRole','setProfileEmail','setProfileInitials','profilePhotoBtn','profilePhotoRemoveBtn'].forEach(function(id){ var el=$(id); if(el) el.disabled = !admin })
      var sec=$('setSmtpSecure'); if(sec) sec.value = String(s.smtpSecure === true || s.smtpSecure === 'true')
      var c=$('setCompact'); if(c) c.checked = !!s.compact
      var n=$('setNotifDot'); if(n) n.checked = !!s.notifDot
      var a=$('setAutoRefresh'); if(a) a.checked = !!s.autoRefresh
      setAvatarVisual($('profilePhotoPreview'), display)
      setText('settingsStatus', admin ? 'Settings loaded' : 'Settings loaded — staff profile is managed by administrator')
    }

    function collectSettings(){
      var s = getSettings()
      var admin = isAdminUser()
      ;[['setBusinessName','businessName'],['setBranch','branch'],['setReceiptFooter','receiptFooter'],['setDefaultFee','defaultFee'],['setSmtpHost','smtpHost'],['setSmtpPort','smtpPort'],['setSmtpUser','smtpUser'],['setSmtpFrom','smtpFrom'],['setSmtpPass','smtpPass']].forEach(function(pair){ var el=$(pair[0]); if(el) s[pair[1]] = el.value.trim() })
      if(admin){
        ;[['setProfileName','profileName'],['setProfileRole','profileRole'],['setProfileEmail','profileEmail'],['setProfileInitials','profileInitials']].forEach(function(pair){ var el=$(pair[0]); if(el) s[pair[1]] = el.value.trim() })
      }
      var sec=$('setSmtpSecure'); if(sec) s.smtpSecure = sec.value
      if(admin && $('reportEmail')) s.reportEmail = $('reportEmail').value.trim() || s.profileEmail
      if(!s.reportEmail || s.reportEmail === 'admin@gcashpos.local') s.reportEmail = s.profileEmail
      if(!s.profileInitials) s.profileInitials = initialsFromName(s.profileName)
      s.compact = !!($('setCompact') && $('setCompact').checked)
      s.notifDot = !!($('setNotifDot') && $('setNotifDot').checked)
      s.autoRefresh = !!($('setAutoRefresh') && $('setAutoRefresh').checked)
      return s
    }

    function saveSettings(showToast){
      var s = collectSettings()
      saveSettingsObj(s)
      applySettings()
      setText('settingsStatus', 'Saved on ' + new Date().toLocaleTimeString('en-PH'))
      if(showToast !== false) toast('Settings saved','success')
    }

    var settingsAutoSaveTimer = null
    function autoSaveSettings(){
      if(settingsAutoSaveTimer) clearTimeout(settingsAutoSaveTimer)
      settingsAutoSaveTimer = setTimeout(function(){
        saveSettings(false)
        setText('settingsStatus', 'Auto-saved on ' + new Date().toLocaleTimeString('en-PH'))
      }, 350)
    }

    var cropImg = null
    function drawCrop(){
      var canvas = $('cropCanvas'); if(!canvas || !cropImg) return
      var ctx = canvas.getContext('2d')
      var zoom = parseFloat(($('cropZoom') && $('cropZoom').value) || 1)
      var offX = parseFloat(($('cropX') && $('cropX').value) || 0)
      var offY = parseFloat(($('cropY') && $('cropY').value) || 0)
      ctx.clearRect(0,0,canvas.width,canvas.height)
      ctx.fillStyle = '#0f172a'; ctx.fillRect(0,0,canvas.width,canvas.height)
      var scale = Math.max(canvas.width / cropImg.width, canvas.height / cropImg.height) * zoom
      var w = cropImg.width * scale
      var h = cropImg.height * scale
      var x = (canvas.width - w) / 2 + offX
      var y = (canvas.height - h) / 2 + offY
      ctx.drawImage(cropImg, x, y, w, h)
    }

    function openCropFromFile(file){
      if(!isAdminUser()) { toast('Staff profile is managed by administrator','info'); return }
      if(!file) return
      var reader = new FileReader()
      reader.onload = function(){
        cropImg = new Image()
        cropImg.onload = function(){
          ;['cropZoom','cropX','cropY'].forEach(function(id){ var el=$(id); if(el) el.value = id==='cropZoom' ? '1' : '0' })
          openOverlay('cropOverlay')
          drawCrop()
        }
        cropImg.src = reader.result
      }
      reader.readAsDataURL(file)
    }

    function applyCroppedPhoto(){
      if(!isAdminUser()) { closeOverlay('cropOverlay'); toast('Staff profile is managed by administrator','info'); return }
      var srcCanvas = $('cropCanvas'); if(!srcCanvas) return
      var out = document.createElement('canvas')
      out.width = 220; out.height = 220
      var ctx = out.getContext('2d')
      ctx.clearRect(0,0,220,220)
      ctx.save()
      ctx.beginPath(); ctx.arc(110,110,110,0,Math.PI*2); ctx.closePath(); ctx.clip()
      ctx.drawImage(srcCanvas, 50, 50, 220, 220, 0, 0, 220, 220)
      ctx.restore()
      var s = getSettings()
      s.profilePhoto = out.toDataURL('image/png')
      saveSettingsObj(s)
      closeOverlay('cropOverlay')
      applySettings(); renderSettingsPage()
      toast('Profile photo updated','success')
    }

    function updateNotifications(){
      var s = getSettings()
      var list = $('notifList'), dot = $('notifDot')
      var items = []
      var saved = getTxnNotifications()
      saved.forEach(function(n){ items.push({kind:'', title:n.title, text:n.text, time:n.createdAt, txId:n.txId, transactionId:n.transactionId, snapshot:n.snapshot}) })
      var pending = rows.filter(function(r){ return (r.status||'').toLowerCase()==='pending' })
      if(pending.length) items.push({kind:'warn', title:pending.length+' pending transaction'+(pending.length===1?'':'s'), text:'Review and confirm pending records.'})
      var failed = rows.filter(function(r){ return (r.status||'').toLowerCase()==='failed' })
      if(failed.length) items.push({kind:'err', title:failed.length+' failed transaction'+(failed.length===1?'':'s'), text:'Check failed records in customer transactions.'})
      var badge = $('syncBadge')
      if(badge && badge.classList.contains('offline')) items.push({kind:'warn', title:'Sync is offline', text:'Data is safe locally and will sync when connected.'})
      if(list){
        list.innerHTML = items.length ? items.map(function(it){
          var meta = it.time ? '<small>'+new Date(it.time).toLocaleString('en-PH',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})+'</small>' : ''
          var snap = it.snapshot ? encodeURIComponent(JSON.stringify(it.snapshot)) : ''
          return '<div class="notif-item" data-target="customers" data-tx-id="'+(it.txId||'')+'" data-transaction-id="'+(it.transactionId||'')+'" data-snapshot="'+snap+'"><div class="notif-ico '+it.kind+'"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div><div class="notif-copy"><strong>'+it.title+'</strong><span>'+it.text+'</span>'+meta+'</div></div>'
        }).join('') : '<div class="drop-empty">No notifications</div>'
        list.querySelectorAll('.notif-item').forEach(function(item){ item.addEventListener('click', function(){
          closeDropdowns()
          var found = rows.find(function(r){ return String(r.id) === String(item.dataset.txId) || String(r.transaction_id) === String(item.dataset.transactionId) })
          if(found) openView(found)
          else if(item.dataset.snapshot){ try{ openView(JSON.parse(decodeURIComponent(item.dataset.snapshot))) } catch(e){ if(window.showPage) window.showPage(item.dataset.target) } }
          else if(window.showPage) window.showPage(item.dataset.target)
        }) })
      }
      if(dot) dot.style.display = (s.notifDot && items.length) ? 'block' : 'none'
    }

    function renderAboutPage(){
      setText('aboutTxnCount', rows.length)
      setText('aboutDate', new Date().toLocaleDateString('en-PH',{weekday:'long',year:'numeric',month:'long',day:'numeric'}))
      var badge = $('syncBadge')
      setText('aboutSyncStatus', badge && badge.classList.contains('online') ? 'Online' : 'Offline')
    }

    function closeDropdowns(){
      var nm=$('notifMenu'), pm=$('profileMenu')
      if(nm) nm.classList.remove('open')
      if(pm) pm.classList.remove('open')
    }

    function toggleDropdown(id){
      var el=$(id); if(!el) return
      var open = el.classList.contains('open')
      closeDropdowns()
      if(!open) el.classList.add('open')
    }

    ;(function(){
      window._renderSettingsPage = renderSettingsPage
      window._renderAboutPage = renderAboutPage
      window._updateNotifications = updateNotifications
      window._refreshAuxPages = function(){ renderReportsPage(); updateNotifications(); renderAboutPage(); applySettings(); if(staffLoaded) renderStaffRows() }
      var save=$('settingsSaveBtn'); if(save) save.addEventListener('click', function(){ saveSettings(true) })
      ;['setBusinessName','setBranch','setReceiptFooter','setDefaultFee','setProfileName','setProfileRole','setProfileEmail','setProfileInitials','setSmtpHost','setSmtpPort','setSmtpUser','setSmtpFrom','setSmtpPass','setSmtpSecure','setCompact','setNotifDot','setAutoRefresh','reportEmail'].forEach(function(id){
        var el = $(id)
        if(!el) return
        el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', autoSaveSettings)
      })
      window.addEventListener('beforeunload', function(){ saveSettings(false) })
      var refresh=$('settingsRefreshBtn'); if(refresh) refresh.addEventListener('click', function(){ loadTransactions(); loadSummary(); setText('settingsStatus','Data refreshed'); toast('Data refreshed','success') })
      var reset=$('settingsResetBtn'); if(reset) reset.addEventListener('click', function(){ showConfirm('Reset Settings?', 'This restores default local settings only.', function(){ localStorage.removeItem('gcashPosSettings'); renderSettingsPage(); applySettings(); toast('Settings reset','success') }, 'Reset', 'btn-danger') })
      var sync=$('settingsSyncBtn'); if(sync) sync.addEventListener('click', async function(){ setText('settingsStatus','Syncing…'); try{ if(window.electronAPI && window.electronAPI.sync) await window.electronAPI.sync.forceSync(); await updateSync(); setText('settingsStatus','Sync completed'); toast('Sync completed','success') }catch(e){ setText('settingsStatus','Sync failed'); toast('Sync failed','error') } })
      var syncBadge=$('syncBadge'); if(syncBadge) syncBadge.addEventListener('click', function(){
        var s = getSettings()
        var nowOnline = syncBadge.classList.contains('online')
        s.syncOverride = !nowOnline
        saveSettingsObj(s)
        updateSync()
        toast('Sync set to ' + (!nowOnline ? 'Online' : 'Offline'), 'success')
      })
      var photoBtn=$('profilePhotoBtn'); if(photoBtn) photoBtn.addEventListener('click', function(){ var inp=$('profilePhotoInput'); if(inp) inp.click() })
      var photoInput=$('profilePhotoInput'); if(photoInput) photoInput.addEventListener('change', function(){ openCropFromFile(photoInput.files && photoInput.files[0]); photoInput.value='' })
      var photoRemove=$('profilePhotoRemoveBtn'); if(photoRemove) photoRemove.addEventListener('click', function(){ var s=getSettings(); s.profilePhoto=''; saveSettingsObj(s); applySettings(); renderSettingsPage(); toast('Profile photo removed','success') })
      var profileEmailInput=$('setProfileEmail'); if(profileEmailInput) profileEmailInput.addEventListener('input', function(){ var re=$('reportEmail'); if(re && (!re.value || re.value === 'admin@gcashpos.local')) re.value = profileEmailInput.value.trim(); autoSaveSettings() })
      ;['cropZoom','cropX','cropY'].forEach(function(id){ var el=$(id); if(el) el.addEventListener('input', drawCrop) })
      var cropApply=$('cropApply'); if(cropApply) cropApply.addEventListener('click', applyCroppedPhoto)
      var cropCancel=$('cropCancel'); if(cropCancel) cropCancel.addEventListener('click', function(){ closeOverlay('cropOverlay') })
      var cropClose=$('cropClose'); if(cropClose) cropClose.addEventListener('click', function(){ closeOverlay('cropOverlay') })
      var cropOverlay=$('cropOverlay'); if(cropOverlay) cropOverlay.addEventListener('click', function(e){ if(e.target===cropOverlay) closeOverlay('cropOverlay') })
      var notif=$('notifBtn'); if(notif) notif.addEventListener('click', function(e){ e.stopPropagation(); updateNotifications(); toggleDropdown('notifMenu') })
      var clear=$('notifClearBtn'); if(clear) clear.addEventListener('click', function(){ saveTxnNotifications([]); var list=$('notifList'); if(list) list.innerHTML='<div class="drop-empty">No notifications</div>'; var dot=$('notifDot'); if(dot) dot.style.display='none'; toast('Notifications cleared','success') })
      var chip=$('profileChip'); if(chip) chip.addEventListener('click', function(e){ e.stopPropagation(); toggleDropdown('profileMenu') })
      var ps=$('profileSettingsBtn'); if(ps) ps.addEventListener('click', function(){ closeDropdowns(); if(window.showPage) window.showPage('settings') })
      var pa=$('profileAboutBtn'); if(pa) pa.addEventListener('click', function(){ closeDropdowns(); if(window.showPage) window.showPage('about') })
      var pl=$('profileLogoutBtn'); if(pl) pl.addEventListener('click', function(){ closeDropdowns(); try { localStorage.removeItem('gcashPosCurrentUser') } catch(e){} window.location.href='./login.html' })
      var ar=$('aboutOpenReports'); if(ar) ar.addEventListener('click', function(){ if(window.showPage) window.showPage('reports') })
      var as=$('aboutOpenSettings'); if(as) as.addEventListener('click', function(){ if(window.showPage) window.showPage('settings') })
      document.addEventListener('click', closeDropdowns)
      var nm=$('notifMenu'); if(nm) nm.addEventListener('click', function(e){ e.stopPropagation() })
      var pm=$('profileMenu'); if(pm) pm.addEventListener('click', function(e){ e.stopPropagation() })
      renderSettingsPage(); applySettings(); renderReportsPage(); renderAboutPage(); updateNotifications()
    })()

    // Confirm dialog
    var cok = $('confirmOk'), ccan = $('confirmCancel'), cov = $('confirmOverlay')
    if(cok) cok.addEventListener('click', function(){
      closeOverlay('confirmOverlay')
      if(_confirmCb){ _confirmCb(); _confirmCb = null }
    })
    if(ccan) ccan.addEventListener('click', function(){ closeOverlay('confirmOverlay') })
    if(cov) cov.addEventListener('click', function(e){ if(e.target===cov) closeOverlay('confirmOverlay') })
  })
})()
