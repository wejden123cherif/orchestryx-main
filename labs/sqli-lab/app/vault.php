<?php require_once __DIR__.'/includes/header.php'; ?>
<div class="page">
  <div style="margin-bottom:28px">
    <h1 style="font-family:'Playfair Display',serif;font-size:28px">Corporate Vault</h1>
    <p style="color:var(--muted);font-size:14px;margin-top:4px">Classified credential storage &mdash; Level 5 clearance required</p>
  </div>
  <?php if($user['access_level']<5): ?>
  <div style="max-width:520px;margin:60px auto;text-align:center">
    <div style="font-size:64px;margin-bottom:20px">&#128272;</div>
    <h2 style="font-family:'Playfair Display',serif;font-size:26px;margin-bottom:12px">Access Restricted</h2>
    <p style="color:var(--silver);font-size:14px;line-height:1.7;margin-bottom:24px">
      The Corporate Vault requires <strong>Level 5 security clearance</strong>.
      Your current clearance is Level <?php echo $user['access_level']; ?>.
    </p>
    <div style="background:var(--panel);border:1px solid var(--rim);border-radius:10px;padding:20px;text-align:left;font-size:13px;color:var(--silver)">
      <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:12px">Vault Contents (Classified)</div>
      <div style="display:flex;flex-direction:column;gap:8px;filter:blur(4px);user-select:none">
        <div style="display:flex;justify-content:space-between"><span>backup_key</span><span>&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;</span></div>
        <div style="display:flex;justify-content:space-between"><span>vpn_seed</span><span>&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;</span></div>
        <div style="display:flex;justify-content:space-between"><span>flag</span><span>&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;</span></div>
      </div>
    </div>
  </div>
  <?php else: ?>
  <?php
  $conn = new mysqli('127.0.0.1','appuser','C0rpApp2024','corpdb');
  $res  = $conn->query("SELECT entry_name,secret,created_at FROM vault ORDER BY id");
  $flag = getenv('FLAG') ?: 'Securinets{sql1_un10n_v4ult_ch4ng3_m3}';
  ?>
  <div class="alert as">&#10003; Level 5 clearance verified. Vault access granted.</div>
  <div class="card" style="max-width:700px">
    <div class="ctitle">Vault Entries</div>
    <table class="dtable">
      <thead><tr><th>Entry</th><th>Secret</th><th>Created</th></tr></thead>
      <tbody>
      <?php while($row=$res->fetch_assoc()): ?>
      <tr>
        <td style="font-family:'DM Mono',monospace"><?php echo htmlspecialchars($row['entry_name']); ?></td>
        <td style="font-family:'DM Mono',monospace;word-break:break-all;<?php echo $row['entry_name']==='flag'?'color:#c9a84c;font-weight:500':''; ?>">
          <?php echo htmlspecialchars($row['secret']); ?>
        </td>
        <td style="color:var(--muted)"><?php echo date('M j, Y',strtotime($row['created_at'])); ?></td>
      </tr>
      <?php endwhile; ?>
      </tbody>
    </table>
  </div>
  <div style="max-width:700px;background:rgba(201,168,76,.08);border:1px solid rgba(201,168,76,.3);border-radius:10px;padding:20px 24px">
    <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:8px">&#127937; Flag</div>
    <div style="font-family:'DM Mono',monospace;font-size:16px;color:#e8c96a;font-weight:500"><?php echo htmlspecialchars($flag); ?></div>
  </div>
  <?php endif; ?>
</div>
<?php require_once __DIR__.'/includes/footer.php'; ?>