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
  // Customer page state
  var cPage = 1
  var cTypeFilter = ''
  var cStatusFilter = ''
  var cSearchQ = ''

  // ── HELPERS ──
  function $(id){ return document.getElementById(id) }
  function setText(id, v){ var el=$(id); if(el) el.textContent=v }
  function money(n){ return Number(n||0).toLocaleString('en-PH',{minimumFractionDigits:0}) }
  function fmtDate(s){ if(!s) return '—'; var d=new Date(s); return d.toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric'}) }
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
        + '<td style="display:flex;gap:6px;align-items:center;">'
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
        + '<td style="display:flex;gap:6px;align-items:center;">'
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
        var data = await window.electronAPI.db.getTransactions({page:1, pageSize:500})
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
  }

  // ── DELETE ──
  async function deleteRow(id){
    try{
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
      + '<div class="det-item"><div class="det-lbl">Transaction ID</div><div class="det-val">'+(r.transaction_id||'—')+'</div></div>'
      + '<div class="det-item"><div class="det-lbl">Date &amp; Time</div><div class="det-val">'+fmtDateLong(r.created_at)+'</div></div>'
      + '<div class="det-item"><div class="det-lbl">Customer</div><div class="det-val">'+(r.customer_name||'Walk-in')+'</div></div>'
      + '<div class="det-item"><div class="det-lbl">Type</div><div class="det-val">'+typeChip(r.type)+'</div></div>'
      + '<div class="det-item"><div class="det-lbl">Amount</div><div class="det-val" style="font-size:20px;font-weight:700;color:#4C6EF5">&#8369;'+money(r.amount)+'</div></div>'
      + '<div class="det-item"><div class="det-lbl">Service Fee</div><div class="det-val" style="font-size:16px;font-weight:600;color:#F59E0B">&#8369;'+money(r.service_fee||0)+'<span style="font-size:11px;color:#9CA3AF;font-weight:400;margin-left:6px">not in totals</span></div></div>'
      + '<div class="det-item"><div class="det-lbl">Status</div><div class="det-val">'+statusPill(r.status)+'</div></div>'
      + '<div class="det-item"><div class="det-lbl">Sync Status</div><div class="det-val">'+(r.sync_status||'—')+'</div></div>'
      + '</div>'
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
    openOverlay('viewOverlay')
  }

  async function updateRowStatus(r, newStatus){
    try{
      if(window.electronAPI && window.electronAPI.db){
        await window.electronAPI.db.updateTransaction(r.id, {
          status: newStatus,
          sync_status: newStatus === 'success' ? 'synced' : 'pending'
        })
      }
      // update in-memory
      var found = rows.find(function(x){ return String(x.id)===String(r.id) })
      if(found){ found.status = newStatus; found.sync_status = newStatus === 'success' ? 'synced' : 'pending' }
      closeOverlay('viewOverlay')
      renderRows()
      loadSummary()
      buildDailyChart(rows)
      buildMonthlyChart(rows, parseInt($('yearSel') ? $('yearSel').value : new Date().getFullYear()))
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
    if(txnId) tx.transaction_id = txnId
    try{
      var res = null
      if(window.electronAPI && window.electronAPI.db){
        res = await window.electronAPI.db.addTransaction(tx)
      }
      tx.id = (res && res.id) ? res.id : Date.now()
      tx.transaction_id = tx.transaction_id || 'TXN-' + Date.now()
      rows.unshift(tx)
      closeOverlay('addOverlay')
      $('addForm').reset()
      page = 1; renderRows()
      buildDailyChart(rows)
      buildMonthlyChart(rows, new Date().getFullYear())
      loadSummary()
      toast('Transaction added!', 'success')
    }catch(err){
      console.error('addTxn', err)
      toast('Failed to add transaction','error')
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
      var online = s && (s.message==='ok' || s.synced===true)
      badge.className = 'sync-badge ' + (online ? 'online' : 'offline')
      lbl.textContent  = online ? 'Online' : 'Offline'
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
