// Dashboard logic: fetch summary and draw chart
document.addEventListener('DOMContentLoaded', async () => {
  if (!window.electronAPI) return

  try {
    const summary = await window.electronAPI.db.getSummary()
    // populate top summary values
    const totalSalesEl = document.getElementById('totalSales')
    const totalMonthEl = document.getElementById('totalMonth')
    const totalCustomersEl = document.getElementById('totalCustomers')
    const salesGrowthEl = document.getElementById('salesGrowth')
    if (totalSalesEl) totalSalesEl.innerText = `P${Number(summary.totalSales||0).toLocaleString()}`
    if (totalMonthEl) totalMonthEl.innerText = `P${Number(summary.salesThisMonth||0).toLocaleString()}`
    if (totalCustomersEl) totalCustomersEl.innerText = `${summary.totalCustomers||0}`
    if (salesGrowthEl) salesGrowthEl.innerText = `${summary.growth || '+0%'}
`

    // draw daily chart (smooth line + dashed secondary line to match mockup)
    if (window.Chart && document.getElementById('dailyChart')) {
      const dailyCanvas = document.getElementById('dailyChart')
      const dailyCtx = dailyCanvas.getContext('2d')
      const labels = summary.dailyLabels || ['14','15','16','17','18','19','20','21','22','23','24']
      const primary = summary.dailyData || [120,150,180,130,160,200,240,300,260,290,245]
      const secondary = summary.dailyBaseline || primary.map(v => Math.round(v * 0.6))

      new Chart(dailyCtx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Sales',
              data: primary,
              borderColor: '#1E88E5',
              backgroundColor: 'transparent',
              borderWidth: 3,
              tension: 0.4,
              pointRadius: 0,
              pointHoverRadius: 4,
              fill: false
            },
            {
              label: 'Benchmark',
              data: secondary,
              borderColor: '#9E9E9E',
              backgroundColor: 'transparent',
              borderWidth: 2,
              tension: 0.4,
              borderDash: [6, 6],
              pointRadius: 0,
              fill: false
            }
          ]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#666' } },
            y: {
              grid: { color: 'rgba(0,0,0,0.06)' },
              ticks: { color: '#666' },
              beginAtZero: false
            }
          }
        }
      })
    }

    // draw monthly chart (smooth line + dashed secondary line)
    if (window.Chart && document.getElementById('monthlyChart')) {
      const monthlyCanvas = document.getElementById('monthlyChart')
      const monthlyCtx = monthlyCanvas.getContext('2d')
      const mLabels = summary.monthLabels || ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
      const mPrimary = summary.monthData || [2000,2400,3000,4200,3600,3100,2800,3300,3800,4200,3600,3900]
      const mSecondary = summary.monthBaseline || mPrimary.map(v => Math.round(v * 0.6))

      new Chart(monthlyCtx, {
        type: 'line',
        data: {
          labels: mLabels,
          datasets: [
            {
              label: 'Sales',
              data: mPrimary,
              borderColor: '#1E88E5',
              backgroundColor: 'transparent',
              borderWidth: 3,
              tension: 0.4,
              pointRadius: 0,
              pointHoverRadius: 4,
              fill: false
            },
            {
              label: 'Benchmark',
              data: mSecondary,
              borderColor: '#BDBDBD',
              backgroundColor: 'transparent',
              borderWidth: 2,
              tension: 0.4,
              borderDash: [6, 6],
              pointRadius: 0,
              fill: false
            }
          ]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#666' } },
            y: { grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { color: '#666' }, beginAtZero: false }
          }
        }
      })
    }

    // load recent transactions (sample if DB empty)
    let rows = await window.electronAPI.db.getTransactions({ page: 1, per: 10 })
    if (!rows || rows.length === 0) {
      rows = [
        { transaction_id: 'TXN-8723', created_at: new Date().toISOString(), customer_name: 'Albert Goopio', type: 'Cash Out', amount: 245000, status: 'Success' },
        { transaction_id: 'TXN-8722', created_at: new Date().toISOString(), customer_name: 'Albert Aluro', type: 'Cash Out', amount: 12000, status: 'Success' },
        { transaction_id: 'TXN-8721', created_at: new Date().toISOString(), customer_name: 'Aiza Villadores', type: 'Cash Out', amount: 6500, status: 'Success' }
      ]
    }

    const tbody = document.querySelector('#txTable tbody')
    if (tbody) {
      tbody.innerHTML = ''
      rows.forEach(r => {
        const tr = document.createElement('tr')
        tr.innerHTML = `<td>${r.transaction_id||''}</td><td>${r.created_at?new Date(r.created_at).toLocaleDateString():''}</td><td>${r.customer_name||'Walk-in'}</td><td>${r.type||''}</td><td>P${Number(r.amount||0).toLocaleString()}</td><td><span class="status ${r.status?.toLowerCase()}">${r.status||''}</span></td><td><button class='btn-view'>View</button></td>`
        tbody.appendChild(tr)
      })
    }
  } catch (err) {
    console.error('Dashboard load error', err)
  }
})
