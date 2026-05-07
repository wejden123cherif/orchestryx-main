<?php require_once __DIR__.'/includes/header.php'; ?>
<div class="ph"><div><h1>Shared with Me</h1><p>Files teammates have shared with you</p></div></div>
<div class="card">
  <div class="ctitle">Shared Files (4)</div>
  <?php $shared = array(
    array('Q3_Report_Draft.pdf',      '&#128196;', '2.1 MB',  'Sarah K.',  '2 days ago'),
    array('product_roadmap_2024.png', '&#128444;', '840 KB',  'Dev Team',  '5 days ago'),
    array('onboarding_checklist.docx','&#128221;', '128 KB',  'HR Dept.',  '1 week ago'),
    array('infra_diagram_v2.webp',    '&#128444;', '1.4 MB',  'Ops Team',  '2 weeks ago'),
  );
  foreach ($shared as $f): ?>
  <div style="display:flex;align-items:center;gap:14px;padding:13px 0;border-bottom:1px solid var(--border)">
    <div style="width:38px;height:38px;background:var(--bg);border:1px solid var(--border);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px"><?php echo $f[1]; ?></div>
    <div style="flex:1">
      <div style="font-size:14px;font-weight:500"><?php echo $f[0]; ?></div>
      <div style="font-size:12px;color:var(--muted);font-family:'IBM Plex Mono',monospace"><?php echo $f[2]; ?> &middot; Shared by <?php echo $f[3]; ?> &middot; <?php echo $f[4]; ?></div>
    </div>
    <span style="padding:5px 14px;border-radius:6px;font-size:12px;font-weight:600;background:var(--bg);color:var(--ink2);border:1px solid var(--border);cursor:pointer">View</span>
  </div>
  <?php endforeach; ?>
</div>
<?php require_once __DIR__.'/includes/footer.php'; ?>