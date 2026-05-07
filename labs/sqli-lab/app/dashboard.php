<?php require_once __DIR__.'/includes/header.php'; ?>
<?php
$conn = new mysqli('127.0.0.1','appuser','C0rpApp2024','corpdb');
$ann  = $conn->query("SELECT * FROM announcements ORDER BY posted DESC LIMIT 3");
?>
<div class="page">
  <div style="margin-bottom:28px">
    <h1 style="font-family:'Playfair Display',serif;font-size:28px;margin-bottom:6px">
      Welcome back, <?php $parts=explode('.',$user['username']); echo ucfirst($parts[0]); ?>
    </h1>
    <p style="color:var(--muted);font-size:14px"><?php echo date('l, F j, Y'); ?> &middot; <?php echo htmlspecialchars($user['department']); ?> Division</p>
  </div>

  <div class="sg">
    <div class="sbox">
      <div class="lb">Employee ID</div>
      <div class="vl" style="font-family:'DM Mono',monospace;font-size:18px">#<?php echo str_pad($user['id'],4,'0',STR_PAD_LEFT); ?></div>
    </div>
    <div class="sbox">
      <div class="lb">Access Level</div>
      <div class="vl"><?php echo $user['access_level']; ?><span style="font-size:14px;color:var(--muted)"> / 5</span></div>
    </div>
    <div class="sbox">
      <div class="lb">Department</div>
      <div class="vl" style="font-size:16px"><?php echo htmlspecialchars($user['department']); ?></div>
    </div>
    <div class="sbox">
      <div class="lb">Joined</div>
      <div class="vl" style="font-size:16px"><?php echo date('M Y',strtotime($user['joined_date'])); ?></div>
    </div>
  </div>

  <div class="card">
    <div class="ctitle">Security Clearance</div>
    <div style="display:flex;align-items:center;gap:16px">
      <div class="ldots">
        <?php for($i=1;$i<=5;$i++): ?>
        <div class="ldot <?php echo $i<=$user['access_level']?'on':''; ?>"></div>
        <?php endfor; ?>
      </div>
      <span style="font-size:13px;color:var(--silver)">Level <?php echo $user['access_level']; ?> of 5</span>
      <?php if($user['access_level']<5): ?>
      <span class="tag tr">Vault Access Restricted</span>
      <?php else: ?>
      <span class="tag tgr">Full Vault Access</span>
      <?php endif; ?>
    </div>
    <?php if($user['access_level']<5): ?>
    <p style="font-size:12px;color:var(--muted);margin-top:12px">
      Your clearance level does not permit access to the
      <a href="/vault.php" style="color:var(--gold)">Corporate Vault</a>.
      Level 5 authorization required.
    </p>
    <?php endif; ?>
  </div>

  <div style="display:grid;grid-template-columns:1fr 340px;gap:20px">
    <div class="card">
      <div class="ctitle">Announcements</div>
      <?php while($row=$ann->fetch_assoc()): ?>
      <div style="padding:14px 0;border-bottom:1px solid var(--rim)">
        <div style="font-size:14px;font-weight:500;margin-bottom:4px"><?php echo htmlspecialchars($row['title']); ?></div>
        <div style="font-size:12px;color:var(--silver);line-height:1.6"><?php echo htmlspecialchars($row['body']); ?></div>
        <div style="font-size:11px;color:var(--muted);margin-top:6px"><?php echo date('M j, Y',strtotime($row['posted'])); ?></div>
      </div>
      <?php endwhile; ?>
    </div>
    <div>
      <div class="card">
        <div class="ctitle">Quick Access</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <a href="/profile.php" class="btn btno" style="text-align:center">&#128100; My Profile</a>
          <a href="/vault.php"   class="btn btno" style="text-align:center">&#128272; Corporate Vault</a>
        </div>
      </div>
      <div class="card">
        <div class="ctitle">System Status</div>
        <div style="display:flex;flex-direction:column;gap:8px;font-size:13px">
          <div style="display:flex;justify-content:space-between"><span style="color:var(--silver)">Authentication</span><span class="tag tgr">Online</span></div>
          <div style="display:flex;justify-content:space-between"><span style="color:var(--silver)">Database</span><span class="tag tgr">Online</span></div>
          <div style="display:flex;justify-content:space-between"><span style="color:var(--silver)">Vault</span><span class="tag tg">Restricted</span></div>
        </div>
      </div>
    </div>
  </div>
</div>
<?php require_once __DIR__.'/includes/footer.php'; ?>