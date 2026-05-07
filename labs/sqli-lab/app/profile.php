<?php require_once __DIR__.'/includes/header.php'; ?>
<div class="page">
  <div style="margin-bottom:28px">
    <h1 style="font-family:'Playfair Display',serif;font-size:28px">My Profile</h1>
  </div>
  <div style="display:grid;grid-template-columns:280px 1fr;gap:20px;align-items:start">
    <div class="card" style="text-align:center">
      <div style="width:72px;height:72px;background:var(--gdim);border-radius:50%;display:grid;place-items:center;font-size:28px;font-weight:700;color:#000;margin:0 auto 16px">
        <?php echo strtoupper(substr($user['username'],0,2)); ?>
      </div>
      <div style="font-family:'Playfair Display',serif;font-size:18px;margin-bottom:4px"><?php echo htmlspecialchars($user['full_name']); ?></div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:16px"><?php echo htmlspecialchars($user['position']); ?></div>
      <span class="tag tg"><?php echo htmlspecialchars($user['department']); ?></span>
    </div>
    <div class="card">
      <div class="ctitle">Employee Details</div>
      <table class="dtable">
        <tr><td style="color:var(--muted);width:160px">Username</td><td style="font-family:'DM Mono',monospace"><?php echo htmlspecialchars($user['username']); ?></td></tr>
        <tr><td style="color:var(--muted)">Employee ID</td><td style="font-family:'DM Mono',monospace">#<?php echo str_pad($user['id'],4,'0',STR_PAD_LEFT); ?></td></tr>
        <tr><td style="color:var(--muted)">Full Name</td><td><?php echo htmlspecialchars($user['full_name']); ?></td></tr>
        <tr><td style="color:var(--muted)">Department</td><td><?php echo htmlspecialchars($user['department']); ?></td></tr>
        <tr><td style="color:var(--muted)">Position</td><td><?php echo htmlspecialchars($user['position']); ?></td></tr>
        <tr><td style="color:var(--muted)">Access Level</td><td>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="ldots"><?php for($i=1;$i<=5;$i++): ?><div class="ldot <?php echo $i<=$user['access_level']?'on':''; ?>"></div><?php endfor; ?></div>
            <span style="font-size:12px;color:var(--muted)">Level <?php echo $user['access_level']; ?></span>
          </div>
        </td></tr>
        <tr><td style="color:var(--muted)">Joined</td><td><?php echo date('F j, Y',strtotime($user['joined_date'])); ?></td></tr>
        <tr><td style="color:var(--muted)">Vault Access</td><td>
          <?php if($user['access_level']>=5): ?>
          <span class="tag tgr">GRANTED</span>
          <?php else: ?>
          <span class="tag tr">DENIED &mdash; Level 5 required</span>
          <?php endif; ?>
        </td></tr>
      </table>
    </div>
  </div>
</div>
<?php require_once __DIR__.'/includes/footer.php'; ?>