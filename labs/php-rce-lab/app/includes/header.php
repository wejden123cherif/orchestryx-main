<?php
if (session_status() === PHP_SESSION_NONE) session_start();
$page  = basename($_SERVER['PHP_SELF'], '.php');
$flash = isset($_SESSION['flash']) ? $_SESSION['flash'] : null;
$ftype = isset($_SESSION['ftype']) ? $_SESSION['ftype'] : 'info';
unset($_SESSION['flash'], $_SESSION['ftype']);
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>CloudDrop &mdash; <?php echo ucfirst($page); ?></title>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --white:#fff;--bg:#f2f4f8;--surface:#fff;
  --border:#e2e6ef;--border2:#c8cfde;
  --ink:#0c1526;--ink2:#3a4558;--muted:#7280a0;
  --blue:#1a6bff;--bbg:#edf2ff;--brim:#b3cbff;
  --green:#15a34a;--gbg:#f0fdf4;--grim:#bbf7d0;
  --red:#dc2626;--rbg:#fef2f2;--rrim:#fecaca;
  --orange:#d97706;--obg:#fffbeb;--orim:#fde68a;
}
body{font-family:'Syne',sans-serif;background:var(--bg);color:var(--ink);min-height:100vh;display:flex;flex-direction:column}
.topbar{background:var(--white);border-bottom:1px solid var(--border);height:56px;display:flex;align-items:center;padding:0 28px;gap:12px;position:sticky;top:0;z-index:100}
.logo{display:flex;align-items:center;gap:8px;font-size:16px;font-weight:700;color:var(--ink);text-decoration:none}
.logo-icon{width:28px;height:28px;background:var(--blue);border-radius:7px;display:grid;place-items:center;color:#fff;font-size:14px}
.logo span{color:var(--blue)}
.tsep{flex:1}
.nav-a{font-size:13px;font-weight:500;color:var(--muted);padding:6px 12px;border-radius:6px;cursor:pointer;text-decoration:none;transition:background .15s,color .15s}
.nav-a:hover,.nav-a.on{background:var(--bg);color:var(--ink)}
.nav-a.on{color:var(--blue)}
.uchip{display:flex;align-items:center;gap:7px;padding:4px 10px 4px 5px;background:var(--bg);border:1px solid var(--border);border-radius:20px;font-size:13px}
.uav{width:24px;height:24px;background:var(--blue);border-radius:50%;display:grid;place-items:center;font-size:11px;color:#fff;font-weight:700}
.layout{display:flex;flex:1}
.sidebar{width:240px;background:var(--white);border-right:1px solid var(--border);padding:20px 12px;display:flex;flex-direction:column;gap:4px;flex-shrink:0}
.sb-lbl{font-size:10px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:var(--muted);padding:0 10px;margin:12px 0 6px}
.sb-a{display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:7px;font-size:13px;font-weight:500;color:var(--ink2);cursor:pointer;text-decoration:none;transition:background .12s}
.sb-a:hover{background:var(--bg)}
.sb-a.on{background:var(--bbg);color:var(--blue)}
.sb-ico{font-size:15px;width:20px;text-align:center}
.sb-ct{margin-left:auto;background:var(--border);color:var(--muted);font-size:11px;padding:1px 7px;border-radius:10px}
.sb-a.on .sb-ct{background:var(--brim);color:var(--blue)}
.sb-div{height:1px;background:var(--border);margin:8px 0}
.scrd{background:linear-gradient(135deg,#1a6bff,#0d4bcc);border-radius:9px;padding:16px;color:#fff;margin-top:auto}
.scrd h5{font-size:12px;opacity:.8;margin-bottom:5px}
.scrd .used{font-size:20px;font-weight:700;margin-bottom:8px}
.sbar{height:4px;background:rgba(255,255,255,.25);border-radius:2px;overflow:hidden}
.sfill{height:100%;background:#fff;border-radius:2px;width:34%}
.content{flex:1;padding:32px;overflow:auto}
.ph{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:28px}
.ph h1{font-size:22px;font-weight:700}
.ph p{font-size:13px;color:var(--muted);margin-top:3px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:24px;margin-bottom:20px}
.ctitle{font-size:12px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);margin-bottom:16px}
.flash{display:flex;align-items:flex-start;gap:10px;padding:12px 16px;border-radius:9px;font-size:13px;margin-bottom:20px}
.fs{background:var(--gbg);border:1px solid var(--grim);color:var(--green)}
.fe{background:var(--rbg);border:1px solid var(--rrim);color:var(--red)}
.fw{background:var(--obg);border:1px solid var(--orim);color:var(--orange)}
.fi{flex-shrink:0;font-size:15px}
.btn{padding:9px 20px;border-radius:8px;font-family:'Syne',sans-serif;font-size:13px;font-weight:600;cursor:pointer;border:none;text-decoration:none;display:inline-block;transition:background .15s}
.btnb{background:var(--blue);color:#fff}
.btnb:hover{background:#1558e6}
.btng{background:var(--bg);color:var(--ink2);border:1px solid var(--border)}
.btng:hover{background:var(--border)}
.app-footer{background:var(--white);border-top:1px solid var(--border);padding:14px 28px;font-size:12px;color:var(--muted);display:flex;justify-content:space-between}
code{font-family:'IBM Plex Mono',monospace;font-size:12px;background:var(--bg);padding:2px 6px;border-radius:4px;color:var(--ink2)}
</style>
</head>
<body>
<header class="topbar">
  <a href="/index.php" class="logo"><div class="logo-icon">&#9729;</div>Cloud<span>Drop</span></a>
  <div class="tsep"></div>
  <a href="/index.php"  class="nav-a <?php echo $page==='index'?'on':''; ?>">Files</a>
  <a href="/shared.php" class="nav-a <?php echo $page==='shared'?'on':''; ?>">Shared</a>
  <a href="/help.php"   class="nav-a <?php echo $page==='help'?'on':''; ?>">Help</a>
  <div class="uchip"><div class="uav">JD</div>j.doe@corp.io</div>
</header>
<div class="layout">
<nav class="sidebar">
  <div class="sb-lbl">Storage</div>
  <a href="/index.php"  class="sb-a <?php echo $page==='index'?'on':''; ?>"><span class="sb-ico">&#128193;</span> My Files</a>
  <a href="/shared.php" class="sb-a <?php echo $page==='shared'?'on':''; ?>"><span class="sb-ico">&#128279;</span> Shared<span class="sb-ct">4</span></a>
  <a href="/index.php"  class="sb-a"><span class="sb-ico">&#11088;</span> Starred</a>
  <a href="/index.php"  class="sb-a"><span class="sb-ico">&#128465;</span> Trash</a>
  <div class="sb-div"></div>
  <div class="sb-lbl">Filter</div>
  <a href="/index.php"  class="sb-a"><span class="sb-ico">&#128444;</span> Images</a>
  <a href="/help.php"   class="sb-a <?php echo $page==='help'?'on':''; ?>"><span class="sb-ico">&#10067;</span> Help</a>
  <div style="flex:1"></div>
  <div class="scrd">
    <h5>Storage Used</h5>
    <div class="used">3.4 <span style="font-size:13px;opacity:.7">/ 10 GB</span></div>
    <div class="sbar"><div class="sfill"></div></div>
  </div>
</nav>
<main class="content">
<?php if ($flash): ?>
<div class="flash <?php echo $ftype==='success'?'fs':($ftype==='error'?'fe':'fw'); ?>">
  <div class="fi"><?php echo $ftype==='success'?'&#9989;':($ftype==='error'?'&#9940;':'&#9888;'); ?></div>
  <div><?php echo $flash; ?></div>
</div>
<?php endif; ?>