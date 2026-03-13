// Admin portal HTML templates for token management

export function renderAdminLayout(title: string, content: string): string {
  return `
<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Tappy Charge Admin</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #fff;
      min-height: 100vh;
    }
    .header {
      background: #111;
      border-bottom: 1px solid #222;
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .header h1 {
      font-size: 20px;
      color: #4CAF50;
    }
    .header nav a {
      color: #888;
      text-decoration: none;
      margin-left: 24px;
      font-size: 14px;
    }
    .header nav a:hover, .header nav a.active {
      color: #fff;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 24px;
    }
    .card {
      background: #1a1a1a;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
    }
    .card h2 {
      font-size: 18px;
      margin-bottom: 16px;
      color: #4CAF50;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: #222;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
    }
    .stat-value {
      font-size: 36px;
      font-weight: bold;
      color: #4CAF50;
    }
    .stat-label {
      font-size: 14px;
      color: #888;
      margin-top: 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #333;
    }
    th {
      color: #888;
      font-weight: 500;
      font-size: 12px;
      text-transform: uppercase;
    }
    tr:hover {
      background: #222;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
    }
    .badge-active { background: #4CAF50; color: #000; }
    .badge-blocked { background: #f44336; color: #fff; }
    .badge-expired { background: #ff9800; color: #000; }
    .badge-pending { background: #2196F3; color: #fff; }
    .btn {
      display: inline-block;
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      text-decoration: none;
      cursor: pointer;
      border: none;
    }
    .btn-primary { background: #4CAF50; color: #000; }
    .btn-secondary { background: #333; color: #fff; }
    .btn-danger { background: #f44336; color: #fff; }
    .btn:hover { opacity: 0.9; }
    .form-group {
      margin-bottom: 16px;
    }
    .form-group label {
      display: block;
      margin-bottom: 8px;
      color: #888;
      font-size: 14px;
    }
    .form-group input, .form-group select, .form-group textarea {
      width: 100%;
      padding: 12px;
      border-radius: 8px;
      border: 1px solid #333;
      background: #222;
      color: #fff;
      font-size: 14px;
    }
    .form-group input:focus, .form-group select:focus {
      outline: none;
      border-color: #4CAF50;
    }
    .search-bar {
      display: flex;
      gap: 12px;
      margin-bottom: 24px;
    }
    .search-bar input {
      flex: 1;
      padding: 12px 16px;
      border-radius: 8px;
      border: 1px solid #333;
      background: #222;
      color: #fff;
    }
    .actions {
      display: flex;
      gap: 8px;
    }
    .uid-display {
      font-family: 'Menlo', 'Monaco', monospace;
      font-size: 13px;
      color: #4CAF50;
    }
    .user-link {
      color: #2196F3;
      text-decoration: none;
    }
    .user-link:hover {
      text-decoration: underline;
    }
    .empty-state {
      text-align: center;
      padding: 48px;
      color: #666;
    }
    .alert {
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 16px;
    }
    .alert-success { background: rgba(76, 175, 80, 0.2); border: 1px solid #4CAF50; }
    .alert-error { background: rgba(244, 67, 54, 0.2); border: 1px solid #f44336; }
  </style>
</head>
<body>
  <header class="header">
    <h1>⚡ Tappy Charge Admin</h1>
    <nav>
      <a href="/admin/tokens" class="active">RFID Tokens</a>
      <a href="/admin/tokens/new">+ Nieuwe Token</a>
      <a href="/admin/tokens/import">CSV Import</a>
      <a href="/api/admin/tokens/export">Export CSV</a>
    </nav>
  </header>
  <main class="container">
    ${content}
  </main>
</body>
</html>
  `.trim();
}

export function renderTokenList(tokens: any[], stats: any, query: any): string {
  const statusFilter = query.status || '';
  const search = query.search || '';
  
  const statsHtml = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${stats.total_tokens}</div>
        <div class="stat-label">Totaal Tokens</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.by_status?.ACTIVE || 0}</div>
        <div class="stat-label">Actief</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.by_status?.BLOCKED || 0}</div>
        <div class="stat-label">Geblokkeerd</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.authorizations_24h?.ALLOWED || 0}</div>
        <div class="stat-label">Auth Succes (24u)</div>
      </div>
    </div>
  `;
  
  const searchHtml = `
    <form class="search-bar" method="GET">
      <input type="text" name="search" placeholder="Zoek op UID, contract ID of email..." value="${search}">
      <select name="status">
        <option value="">Alle statussen</option>
        <option value="ACTIVE" ${statusFilter === 'ACTIVE' ? 'selected' : ''}>Actief</option>
        <option value="BLOCKED" ${statusFilter === 'BLOCKED' ? 'selected' : ''}>Geblokkeerd</option>
        <option value="EXPIRED" ${statusFilter === 'EXPIRED' ? 'selected' : ''}>Verlopen</option>
        <option value="PENDING" ${statusFilter === 'PENDING' ? 'selected' : ''}>Pending</option>
      </select>
      <button type="submit" class="btn btn-secondary">Zoeken</button>
    </form>
  `;
  
  const tableHtml = tokens.length > 0 ? `
    <table>
      <thead>
        <tr>
          <th>Contract ID</th>
          <th>RFID UID</th>
          <th>Status</th>
          <th>Whitelist</th>
          <th>Gebruiker</th>
          <th>Gebruik</th>
          <th>Acties</th>
        </tr>
      </thead>
      <tbody>
        ${tokens.map(t => `
          <tr>
            <td><a href="/admin/tokens/${t.id}" class="user-link">${t.contract_id}</a></td>
            <td class="uid-display">${t.uid}</td>
            <td><span class="badge badge-${t.status.toLowerCase()}">${t.status}</span></td>
            <td>${t.whitelist}</td>
            <td>${t.user ? `<a href="mailto:${t.user.email}" class="user-link">${t.user.email}</a>` : '<span style="color:#666">-</span>'}</td>
            <td>${t.usage_count}x</td>
            <td class="actions">
              <a href="/admin/tokens/${t.id}" class="btn btn-secondary">Details</a>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : `
    <div class="empty-state">
      <p>Geen tokens gevonden</p>
    </div>
  `;
  
  return renderAdminLayout('RFID Tokens', `
    ${statsHtml}
    <div class="card">
      <h2>RFID Tokens</h2>
      ${searchHtml}
      ${tableHtml}
    </div>
  `);
}

export function renderTokenDetail(token: any): string {
  const statusBadge = `<span class="badge badge-${token.status.toLowerCase()}">${token.status}</span>`;
  
  const auditLogsHtml = token.audit_logs?.length > 0 ? `
    <table>
      <thead>
        <tr>
          <th>Datum</th>
          <th>Actie</th>
          <th>Veld</th>
          <th>Oude waarde</th>
          <th>Nieuwe waarde</th>
          <th>Door</th>
        </tr>
      </thead>
      <tbody>
        ${token.audit_logs.map((log: any) => `
          <tr>
            <td>${new Date(log.createdAt).toLocaleString('nl-NL')}</td>
            <td>${log.action}</td>
            <td>${log.field || '-'}</td>
            <td>${log.oldValue || '-'}</td>
            <td>${log.newValue || '-'}</td>
            <td>${log.performedBy || 'System'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : '<p style="color:#666">Geen audit logs</p>';
  
  const authsHtml = token.recent_authorizations?.length > 0 ? `
    <table>
      <thead>
        <tr>
          <th>Datum</th>
          <th>CPO</th>
          <th>Locatie</th>
          <th>Resultaat</th>
          <th>Response tijd</th>
        </tr>
      </thead>
      <tbody>
        ${token.recent_authorizations.map((auth: any) => `
          <tr>
            <td>${new Date(auth.createdAt).toLocaleString('nl-NL')}</td>
            <td>${auth.cpoCountryCode}-${auth.cpoPartyId}</td>
            <td>${auth.locationId || '-'}</td>
            <td><span class="badge badge-${auth.result === 'ALLOWED' ? 'active' : 'blocked'}">${auth.result}</span></td>
            <td>${auth.responseTime}ms</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : '<p style="color:#666">Geen autorisaties</p>';
  
  return renderAdminLayout(`Token ${token.contract_id}`, `
    <div class="card">
      <h2>Token Details</h2>
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 24px;">
        <div>
          <div class="form-group">
            <label>Contract ID</label>
            <input type="text" value="${token.contract_id}" readonly>
          </div>
          <div class="form-group">
            <label>RFID UID</label>
            <input type="text" value="${token.uid}" readonly style="font-family: monospace;">
          </div>
          <div class="form-group">
            <label>Visual Number</label>
            <input type="text" value="${token.visual_number || '-'}" readonly>
          </div>
          <div class="form-group">
            <label>Type</label>
            <input type="text" value="${token.type}" readonly>
          </div>
        </div>
        <div>
          <div class="form-group">
            <label>Status</label>
            <div>${statusBadge}</div>
          </div>
          <div class="form-group">
            <label>Whitelist</label>
            <input type="text" value="${token.whitelist}" readonly>
          </div>
          <div class="form-group">
            <label>Gebruiker</label>
            <input type="text" value="${token.user?.email || 'Niet toegewezen'}" readonly>
          </div>
          <div class="form-group">
            <label>Gebruik</label>
            <input type="text" value="${token.usage_count}x (laatst: ${token.last_used_at ? new Date(token.last_used_at).toLocaleString('nl-NL') : 'nooit'})" readonly>
          </div>
        </div>
      </div>
      <div class="actions" style="margin-top: 24px;">
        ${token.status === 'ACTIVE' ? 
          `<button class="btn btn-danger" onclick="blockToken('${token.id}')">Blokkeren</button>` :
          `<button class="btn btn-primary" onclick="unblockToken('${token.id}')">Deblokkeren</button>`
        }
        ${token.user ? 
          `<button class="btn btn-secondary" onclick="unassignToken('${token.id}')">Loskoppelen</button>` :
          `<button class="btn btn-secondary" onclick="showAssignModal('${token.id}')">Toewijzen</button>`
        }
        <a href="/admin/tokens" class="btn btn-secondary">Terug</a>
      </div>
    </div>
    
    <div class="card">
      <h2>Audit Log</h2>
      ${auditLogsHtml}
    </div>
    
    <div class="card">
      <h2>Recente Autorisaties</h2>
      ${authsHtml}
    </div>
    
    <script>
      async function blockToken(id) {
        if (!confirm('Weet je zeker dat je deze token wilt blokkeren?')) return;
        await fetch('/api/admin/tokens/' + id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Basic ' + btoa('admin:tappycharge2025') },
          body: JSON.stringify({ status: 'BLOCKED', reason: 'Geblokkeerd via admin portal' })
        });
        location.reload();
      }
      
      async function unblockToken(id) {
        await fetch('/api/admin/tokens/' + id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Basic ' + btoa('admin:tappycharge2025') },
          body: JSON.stringify({ status: 'ACTIVE' })
        });
        location.reload();
      }
      
      async function unassignToken(id) {
        if (!confirm('Weet je zeker dat je deze token wilt loskoppelen?')) return;
        await fetch('/api/admin/tokens/' + id + '/unassign', {
          method: 'POST',
          headers: { 'Authorization': 'Basic ' + btoa('admin:tappycharge2025') }
        });
        location.reload();
      }
      
      function showAssignModal(id) {
        const email = prompt('Voer het e-mailadres van de gebruiker in:');
        if (!email) return;
        fetch('/api/admin/tokens/' + id + '/assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Basic ' + btoa('admin:tappycharge2025') },
          body: JSON.stringify({ user_email: email })
        }).then(r => r.json()).then(data => {
          if (data.error) alert(data.error);
          else location.reload();
        });
      }
    </script>
  `);
}

export function renderNewTokenForm(error?: string, success?: any): string {
  const alertHtml = error ? `<div class="alert alert-error">${error}</div>` :
                    success ? `<div class="alert alert-success">Token aangemaakt: ${success.contract_id}</div>` : '';
  
  return renderAdminLayout('Nieuwe Token', `
    <div class="card">
      <h2>Nieuwe RFID Token Aanmaken</h2>
      ${alertHtml}
      <form method="POST" action="/admin/tokens/new">
        <div class="form-group">
          <label>RFID UID *</label>
          <input type="text" name="uid" placeholder="04:A2:B3:C4:D5:E6:F7" required>
        </div>
        <div class="form-group">
          <label>Type</label>
          <select name="type">
            <option value="RFID">RFID</option>
            <option value="AD_HOC_USER">Ad-hoc User</option>
            <option value="APP_USER">App User</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <div class="form-group">
          <label>Whitelist Strategie</label>
          <select name="whitelist">
            <option value="ALWAYS">ALWAYS - Altijd geldig zonder check</option>
            <option value="ALLOWED">ALLOWED - Vereist real-time autorisatie</option>
            <option value="ALLOWED_OFFLINE">ALLOWED_OFFLINE - Offline ook toegestaan</option>
            <option value="NEVER">NEVER - Altijd real-time check vereist</option>
          </select>
        </div>
        <div class="form-group">
          <label>Gebruiker E-mail (optioneel)</label>
          <input type="email" name="user_email" placeholder="user@example.com">
        </div>
        <div class="form-group">
          <label>Group ID (optioneel)</label>
          <input type="text" name="group_id" placeholder="FLEET-001">
        </div>
        <div class="form-group">
          <label>Geldig tot (optioneel)</label>
          <input type="date" name="valid_until">
        </div>
        <div class="actions">
          <button type="submit" class="btn btn-primary">Token Aanmaken</button>
          <a href="/admin/tokens" class="btn btn-secondary">Annuleren</a>
        </div>
      </form>
    </div>
  `);
}

export function renderImportForm(result?: any): string {
  const resultHtml = result ? `
    <div class="alert ${result.errors?.length > 0 ? 'alert-error' : 'alert-success'}">
      <strong>Import voltooid:</strong> ${result.imported} tokens geïmporteerd, ${result.skipped} overgeslagen
      ${result.errors?.length > 0 ? `<br><br><strong>Fouten:</strong><br>${result.errors.map((e: any) => `Rij ${e.row}: ${e.error}`).join('<br>')}` : ''}
    </div>
  ` : '';
  
  return renderAdminLayout('CSV Import', `
    <div class="card">
      <h2>RFID Tokens Importeren</h2>
      <p style="color:#888; margin-bottom:24px;">Upload een CSV bestand met kolommen: <code>rfid_uid, user_email, visual_number</code></p>
      ${resultHtml}
      <form method="POST" action="/admin/tokens/import">
        <div class="form-group">
          <label>CSV Data</label>
          <textarea name="csv" rows="10" placeholder="rfid_uid,user_email,visual_number
04A2B3C4D5E6F7,user1@example.com,**** 1234
04B3C4D5E6F7A8,user2@example.com,**** 5678"></textarea>
        </div>
        <div class="form-group">
          <label>Whitelist Strategie (voor alle tokens)</label>
          <select name="whitelist">
            <option value="ALWAYS">ALWAYS</option>
            <option value="ALLOWED">ALLOWED</option>
          </select>
        </div>
        <div class="form-group">
          <label>Group ID (optioneel)</label>
          <input type="text" name="group_id" placeholder="BATCH-2025-01">
        </div>
        <div class="actions">
          <button type="submit" class="btn btn-primary">Importeren</button>
          <a href="/admin/tokens" class="btn btn-secondary">Annuleren</a>
        </div>
      </form>
    </div>
    
    <div class="card">
      <h2>CSV Formaat</h2>
      <p style="color:#888;">Voorbeeld CSV bestand:</p>
      <pre style="background:#222; padding:16px; border-radius:8px; overflow-x:auto;">
rfid_uid,user_email,visual_number
04A2B3C4D5E6F7,john@example.com,**** 1234
04B3C4D5E6F7A8,jane@example.com,**** 5678
04C4D5E6F7A8B9,,
      </pre>
      <p style="color:#888; margin-top:16px;">Velden:</p>
      <ul style="color:#888; margin-left:24px;">
        <li><code>rfid_uid</code> - Verplicht. RFID UID van de kaart (hex formaat)</li>
        <li><code>user_email</code> - Optioneel. E-mail van de gebruiker om aan te koppelen</li>
        <li><code>visual_number</code> - Optioneel. Gemaskeerd nummer voor display</li>
      </ul>
    </div>
  `);
}
