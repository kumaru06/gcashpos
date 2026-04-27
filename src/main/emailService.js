const nodemailer = require('nodemailer')

function sanitizeConfig (config = {}) {
  return {
    host: String(config.host || '').trim(),
    port: Number(config.port || 587),
    secure: Boolean(config.secure),
    user: String(config.user || '').trim(),
    pass: String(config.pass || ''),
    from: String(config.from || config.user || '').trim()
  }
}

function buildReportText (report = {}) {
  const rows = Array.isArray(report.rows) ? report.rows : []
  const summary = report.summary || {}
  const range = report.range || {}
  const lines = []

  lines.push('GCash POS Report')
  lines.push('')
  lines.push(`Date Range: ${range.from || '—'} to ${range.to || '—'}`)
  lines.push(`Total Records: ${rows.length}`)
  lines.push(`Cash In: ₱${summary.cashIn || '0'}`)
  lines.push(`Cash Out: ₱${summary.cashOut || '0'}`)
  lines.push(`Net (In + Out): ₱${summary.net || '0'}`)
  lines.push(`Service Fee: ₱${summary.serviceFee || '0'}`)
  lines.push(`Total Amount: ₱${summary.totalAmount || summary.net || '0'}`)
  lines.push(`Grand Total (Amount + Service Fee): ₱${summary.grandTotal || '0'}`)
  lines.push('')
  lines.push('Transactions:')
  rows.forEach((r, index) => {
    lines.push(`${index + 1}. ${r.transaction_id || '—'} | ${r.created_at || '—'} | ${r.customer_name || 'Walk-in'} | ${r.type || '—'} | ₱${r.amount || 0} | ${r.status || '—'}`)
  })
  lines.push('')
  lines.push('A full CSV spreadsheet is also attached to this email.')
  lines.push('')
  lines.push('Generated from GCash POS.')
  return lines.join('\n')
}

function csvEscape (value) {
  return `"${String(value == null ? '' : value).replace(/"/g, '""')}"`
}

function buildReportCsv (report = {}) {
  const rows = Array.isArray(report.rows) ? report.rows : []
  const summary = report.summary || {}
  const lines = []

  lines.push(['Transaction ID', 'Date', 'Customer', 'Type', 'Amount', 'Service Fee', 'Status'].map(csvEscape).join(','))
  rows.forEach((r) => {
    lines.push([
      r.transaction_id || '',
      r.created_at || '',
      r.customer_name || 'Walk-in',
      r.type || '',
      r.amount || 0,
      r.service_fee || 0,
      r.status || ''
    ].map(csvEscape).join(','))
  })

  lines.push('')
  lines.push(['SUMMARY', '', '', '', '', '', ''].map(csvEscape).join(','))
  lines.push(['Cash In', '', '', '', summary.cashIn || '0', '', ''].map(csvEscape).join(','))
  lines.push(['Cash Out', '', '', '', summary.cashOut || '0', '', ''].map(csvEscape).join(','))
  lines.push(['Total Amount (Cash In + Cash Out)', '', '', '', summary.totalAmount || summary.net || '0', '', ''].map(csvEscape).join(','))
  lines.push(['Service Fee', '', '', '', summary.serviceFee || '0', '', ''].map(csvEscape).join(','))
  lines.push(['GRAND TOTAL (Amount + Service Fee)', '', '', '', summary.grandTotal || '0', '', ''].map(csvEscape).join(','))

  return lines.join('\n')
}

function buildReportHtml (report = {}) {
  const rows = Array.isArray(report.rows) ? report.rows : []
  const summary = report.summary || {}
  const range = report.range || {}
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

  return `
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.45">
      <h2 style="margin:0 0 4px;color:#1d4ed8">GCash POS Report</h2>
      <p style="margin:0 0 18px;color:#6b7280">${esc(range.from || '—')} to ${esc(range.to || '—')}</p>
      <table style="border-collapse:collapse;margin-bottom:18px;width:100%;max-width:680px">
        <tr>
          <td style="padding:10px;border:1px solid #e5e7eb"><strong>Cash In</strong><br>₱${esc(summary.cashIn || '0')}</td>
          <td style="padding:10px;border:1px solid #e5e7eb"><strong>Cash Out</strong><br>₱${esc(summary.cashOut || '0')}</td>
          <td style="padding:10px;border:1px solid #e5e7eb"><strong>Net</strong><br>₱${esc(summary.net || '0')}</td>
          <td style="padding:10px;border:1px solid #e5e7eb"><strong>Service Fee</strong><br>₱${esc(summary.serviceFee || '0')}</td>
        </tr>
        <tr>
          <td colspan="2" style="padding:10px;border:1px solid #e5e7eb;background:#f8faff"><strong>Total Amount</strong><br>₱${esc(summary.totalAmount || summary.net || '0')}</td>
          <td colspan="2" style="padding:10px;border:1px solid #e5e7eb;background:#ecfdf5"><strong>Grand Total (Amount + Service Fee)</strong><br>₱${esc(summary.grandTotal || '0')}</td>
        </tr>
      </table>
      <h3 style="margin:0 0 8px">Transactions (${rows.length})</h3>
      <table style="border-collapse:collapse;width:100%;max-width:900px;font-size:13px">
        <thead>
          <tr style="background:#f8faff">
            <th style="text-align:left;padding:8px;border:1px solid #e5e7eb">Transaction ID</th>
            <th style="text-align:left;padding:8px;border:1px solid #e5e7eb">Date</th>
            <th style="text-align:left;padding:8px;border:1px solid #e5e7eb">Customer</th>
            <th style="text-align:left;padding:8px;border:1px solid #e5e7eb">Type</th>
            <th style="text-align:left;padding:8px;border:1px solid #e5e7eb">Amount</th>
            <th style="text-align:left;padding:8px;border:1px solid #e5e7eb">Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb">${esc(r.transaction_id || '—')}</td>
              <td style="padding:8px;border:1px solid #e5e7eb">${esc(r.created_at || '—')}</td>
              <td style="padding:8px;border:1px solid #e5e7eb">${esc(r.customer_name || 'Walk-in')}</td>
              <td style="padding:8px;border:1px solid #e5e7eb">${esc(r.type || '—')}</td>
              <td style="padding:8px;border:1px solid #e5e7eb">₱${esc(r.amount || 0)}</td>
              <td style="padding:8px;border:1px solid #e5e7eb">${esc(r.status || '—')}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <p style="margin-top:12px;color:#6b7280">All ${rows.length} records are included here and in the attached CSV spreadsheet.</p>
      <p style="margin-top:18px;color:#6b7280">Generated from GCash POS.</p>
    </div>
  `
}

async function sendReportEmail ({ to, smtp, report }) {
  const cfg = sanitizeConfig(smtp)
  const recipient = String(to || '').trim()

  if (!recipient) throw new Error('Recipient email is required.')
  if (!cfg.host || !cfg.user || !cfg.pass) {
    throw new Error('SMTP settings are incomplete. Add SMTP host, username, and app password in Settings.')
  }

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass }
  })

  const range = report && report.range ? report.range : {}
  const subject = `GCash POS Report ${range.from || ''} to ${range.to || ''}`.trim()
  const safeFrom = String(range.from || 'from').replace(/[^0-9A-Za-z_-]/g, '-')
  const safeTo = String(range.to || 'to').replace(/[^0-9A-Za-z_-]/g, '-')

  const info = await transporter.sendMail({
    from: cfg.from || cfg.user,
    to: recipient,
    subject,
    text: buildReportText(report),
    html: buildReportHtml(report),
    attachments: [
      {
        filename: `gcash-pos-report-${safeFrom}-to-${safeTo}.csv`,
        content: buildReportCsv(report),
        contentType: 'text/csv; charset=utf-8'
      }
    ]
  })

  return { success: true, messageId: info.messageId }
}

module.exports = { sendReportEmail }
