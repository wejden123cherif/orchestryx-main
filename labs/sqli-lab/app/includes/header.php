<?php
if (session_status() === PHP_SESSION_NONE) session_start();
$page = basename($_SERVER['PHP_SELF'], '.php');
$user = $_SESSION['user'] ?? null;
if (!$user && $page !== 'login') {
    header('Location: /login.php'); exit;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>NexBank — <?php echo ucfirst($page); ?></title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --ink:#09090b;--surface:#111318;--panel:#18191f;--rim:#27293a;
  --gold:#c9a84c;--gdim:#9e7e35;--gglow:rgba(201,168,76,.12);
  --silver:#8b95a8;--text:#e8eaf2;--muted:#555d70;
  --red:#e05555;--green:#3db97a;
}
body{font-family:'DM Sans',sans-serif;background:var(--ink);color:var(--text);min-height:100vh;display:flex;flex-direction:column}
.topbar{background:var(--surface);border-bottom:1px solid var(--rim);height:60px;display:flex;align-items:center;padding:0 32px;gap:12px;position:sticky;top:0;z-index:200}
.topbar a.brand{display:flex;align-items:center;gap:10px;text-decoration:none}
.mark{width:34px;height:34px;border:2px solid var(--gold);border-radius:8px;display:grid;place-items:center;font-family:'Playfair Display',serif;font-size:17px;color:var(--gold)}
.bname{font-family:'Playfair Display',serif;font-size:18px;color:var(--text)}
.bname sup{font-size:8px;letter-spacing:2px;color:var(--gold);font-family:'DM Sans',sans-serif}
.sep{flex:1}
.tnav{display:flex;gap:4px}
.tnav a{padding:7px 14px;border-radius:7px;font-size:13px;font-weight:500;color:var(--silver);text-decoration:none;transition:background .15s,color .15s}
.tnav a:hover,.tnav a.on{background:var(--gglow);color:var(--gold)}
.tchip{display:flex;align-items:center;gap:8px;padding:5px 12px 5px 6px;background:var(--panel);border:1px solid var(--rim);border-radius:20px;font-size:13px}
.tav{width:26px;height:26px;background:var(--gdim);border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:700;color:#000}
.page{flex:1;max-width:1100px;width:100%;margin:0 auto;padding:36px 32px}
.card{background:var(--surface);border:1px solid var(--rim);border-radius:12px;padding:28px;margin-bottom:20px}
.ctitle{font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);margin-bottom:16px}
.sg{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px;margin-bottom:24px}
.sbox{background:var(--panel);border:1px solid var(--rim);border-radius:10px;padding:20px}
.sbox .lb{font-size:11px;color:var(--muted);margin-bottom:6px}
.sbox .vl{font-size:22px;font-weight:600}
.dtable{width:100%;border-collapse:collapse;font-size:13px}
.dtable th{text-align:left;padding:10px 14px;font-size:11px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--rim)}
.dtable td{padding:12px 14px;border-bottom:1px solid var(--rim)}
.dtable tr:last-child td{border-bottom:none}
.dtable tr:hover td{background:var(--panel)}
.tag{display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:500}
.tg{background:var(--gglow);border:1px solid rgba(201,168,76,.3);color:var(--gold)}
.tr{background:rgba(224,85,85,.1);border:1px solid rgba(224,85,85,.3);color:var(--red)}
.tgr{background:rgba(61,185,122,.1);border:1px solid rgba(61,185,122,.3);color:var(--green)}
.tb{background:rgba(79,142,247,.1);border:1px solid rgba(79,142,247,.3);color:#4f8ef7}
.alert{padding:12px 16px;border-radius:8px;font-size:13px;margin-bottom:20px;display:flex;gap:10px;align-items:flex-start}
.ae{background:rgba(224,85,85,.08);border:1px solid rgba(224,85,85,.25);color:#e07070}
.as{background:rgba(61,185,122,.08);border:1px solid rgba(61,185,122,.25);color:#5dd49a}
.btn{padding:9px 20px;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;cursor:pointer;border:none;transition:background .15s;text-decoration:none;display:inline-block}
.btng{background:var(--gold);color:#000}
.btng:hover{background:#d4b058}
.btno{background:var(--panel);color:var(--silver);border:1px solid var(--rim)}
.btno:hover{color:var(--text)}
.ldots{display:flex;gap:5px}
.ldot{width:22px;height:6px;border-radius:3px;background:var(--rim)}
.ldot.on{background:var(--gold)}
footer{background:var(--surface);border-top:1px solid var(--rim);padding:16px 32px;font-size:12px;color:var(--muted);display:flex;justify-content:space-between}
</style>
</head>
<body>
<?php if ($user): ?>
<header class="topbar">
  <a href="/dashboard.php" class="brand">
    <div class="mark">N</div>
    <div class="bname">NexBank <sup>CORP</sup></div>
  </a>
  <div class="sep"></div>
  <nav class="tnav">
    <a href="/dashboard.php" class="<?php echo $page==='dashboard'?'on':''; ?>">Dashboard</a>
    <a href="/profile.php"   class="<?php echo $page==='profile'?'on':''; ?>">My Profile</a>
    <a href="/vault.php"     class="<?php echo $page==='vault'?'on':''; ?>">Vault</a>
  </nav>
  <div class="tchip">
    <div class="tav"><?php echo strtoupper(substr($user['username'],0,2)); ?></div>
    <?php echo htmlspecialchars($user['username']); ?>
  </div>
  <a href="/logout.php" class="btn btno" style="margin-left:8px;padding:5px 14px;font-size:12px">Sign out</a>
</header>
<?php endif; ?>