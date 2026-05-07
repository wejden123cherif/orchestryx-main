<?php
if (session_status() === PHP_SESSION_NONE) session_start();
$pg = isset($_GET['page']) ? $_GET['page'] : 'home';
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>The Herald &mdash; Independent News</title>
<link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Source+Sans+3:wght@300;400;600&family=Source+Code+Pro:wght@400;500&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --paper:#f7f3eb;--cream:#ede8da;--white:#fff;
  --ink:#1a1510;--ink2:#3a3020;--muted:#7a6e5a;
  --rule:#c4b99a;--red:#b91c1c;--bg:#2a231a;
}
body{font-family:'Source Sans 3',sans-serif;background:var(--bg);color:var(--ink)}
.masthead{background:var(--paper);border-bottom:4px double var(--ink);padding:18px 40px 14px;text-align:center}
.mh-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.mh-meta{font-size:11px;color:var(--muted);letter-spacing:.5px}
.masthead h1{font-family:'Libre Baskerville',serif;font-size:clamp(36px,6vw,68px);font-weight:700;color:var(--ink);letter-spacing:-1px;line-height:1;margin-bottom:6px}
.mh-rule{display:flex;align-items:center;gap:16px;justify-content:center;margin:8px 0}
.mh-line{flex:1;max-width:220px;height:1px;background:var(--rule)}
.mh-rule span{font-family:'Libre Baskerville',serif;font-style:italic;font-size:12px;color:var(--muted)}
.nav-strip{background:var(--ink);display:flex;justify-content:center;flex-wrap:wrap}
.nav-strip a{color:#c8bfaa;text-decoration:none;font-size:11px;font-weight:600;letter-spacing:1.8px;text-transform:uppercase;padding:10px 18px;border-right:1px solid #333;transition:background .15s,color .15s}
.nav-strip a:first-child{border-left:1px solid #333}
.nav-strip a:hover,.nav-strip a.on{background:var(--red);color:#fff}
.herald-page{background:var(--paper);max-width:1100px;margin:24px auto;border:1px solid var(--rule);box-shadow:0 12px 48px rgba(0,0,0,.55)}
.two-col{display:grid;grid-template-columns:1fr 280px}
.main-col{padding:32px 36px;border-right:1px solid var(--rule);min-height:420px}
.side-col{padding:24px 20px}
.sec-lbl{font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--red);margin-bottom:10px}
.art-head{font-family:'Libre Baskerville',serif;font-size:28px;font-weight:700;line-height:1.25;color:var(--ink);margin-bottom:12px;padding-bottom:14px;border-bottom:2px solid var(--ink)}
.byline{font-size:12px;color:var(--muted);margin-bottom:20px;padding-bottom:12px;border-bottom:1px solid var(--rule);display:flex;gap:16px;flex-wrap:wrap}
.byline strong{color:var(--ink2)}
.art-body{font-family:'Libre Baskerville',serif;font-size:15px;line-height:1.85;color:var(--ink2)}
.art-body p+p{margin-top:15px}
.art-body blockquote{border-left:3px solid var(--red);padding:10px 18px;margin:20px 0;font-style:italic;background:var(--cream)}
.drop::first-letter{float:left;font-size:62px;line-height:.75;margin:6px 8px -2px 0;font-weight:700;color:var(--ink)}
.side-hd{font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--ink);padding-bottom:7px;border-bottom:2px solid var(--ink);margin-bottom:12px}
.side-it{padding:10px 0;border-bottom:1px solid var(--rule)}
.side-it:last-child{border-bottom:none}
.side-it a{font-family:'Libre Baskerville',serif;font-size:13px;font-weight:700;color:var(--ink);text-decoration:none;line-height:1.4;display:block;margin-bottom:3px}
.side-it a:hover{color:var(--red)}
.side-it span{font-size:11px;color:var(--muted)}
.warn-box{background:#fef9c3;border:1px solid #ca8a04;border-radius:4px;padding:14px 16px;font-size:13px;color:#713f12;margin-bottom:20px}
.h-footer{background:var(--cream);border-top:2px solid var(--rule);padding:14px 36px;display:flex;justify-content:space-between;font-size:11px;color:var(--muted)}
.h-footer strong{color:var(--ink2)}
@media(max-width:700px){.two-col{grid-template-columns:1fr}.main-col{border-right:none;padding:20px}.masthead{padding:16px 20px}.nav-strip a{padding:8px 12px;font-size:10px}}
</style>
</head>
<body>
<div class="masthead">
  <div class="mh-top">
    <div class="mh-meta"><?php echo date('l, F j, Y'); ?></div>
    <div class="mh-meta">Vol. CXLVII &middot; No. 312 &middot; Est. 1876</div>
  </div>
  <h1>The Herald</h1>
  <div class="mh-rule"><div class="mh-line"></div><span>Independent &middot; Unbiased &middot; Since 1876</span><div class="mh-line"></div></div>
</div>
<nav class="nav-strip">
  <a href="/?page=home"     class="<?php echo $pg==='home'?'on':''; ?>">Home</a>
  <a href="/?page=world"    class="<?php echo $pg==='world'?'on':''; ?>">World</a>
  <a href="/?page=tech"     class="<?php echo $pg==='tech'?'on':''; ?>">Technology</a>
  <a href="/?page=business" class="<?php echo $pg==='business'?'on':''; ?>">Business</a>
  <a href="/?page=opinion"  class="<?php echo $pg==='opinion'?'on':''; ?>">Opinion</a>
  <a href="/?page=about"    class="<?php echo $pg==='about'?'on':''; ?>">About</a>
  <a href="/?page=contact"  class="<?php echo $pg==='contact'?'on':''; ?>">Contact</a>
  <?php if (!empty($_SESSION['admin'])): ?>
  <a href="/admin.php" style="color:#ffd700">&#9733; Admin</a>
  <?php endif; ?>
</nav>
<div class="herald-page">
  <div class="two-col">
    <main class="main-col">