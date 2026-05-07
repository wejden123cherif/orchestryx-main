<?php
session_start();
$secret   = getenv('APP_SECRET') ?: 'ch4ng3_th1s_k3y_pr0d_2024';
$flag     = getenv('FLAG')       ?: 'Securinets{lf1_d0ubl3_d3c0d3_3nv_forg3_ch4ng3_m3}';
$expected = hash_hmac('sha256', 'admin', $secret);
$token    = isset($_SESSION['admin_token']) ? $_SESSION['admin_token'] : '';

if ($token !== $expected) {
    http_response_code(403);
?>
<!DOCTYPE html>
<html><head><title>403</title>
<link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@700&family=Source+Code+Pro&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#1a1510;font-family:'Source Code Pro',monospace;display:grid;place-items:center;height:100vh;color:#c8bfaa}.box{text-align:center}h1{font-family:'Libre Baskerville',serif;font-size:80px;color:#b91c1c;line-height:1}p{font-size:14px;color:#7a6e5a;margin-top:12px}a{color:#c9a84c;text-decoration:none}</style>
</head><body><div class="box"><h1>403</h1><p>Admin session token missing or invalid.</p><p style="margin-top:8px"><a href="/">&#8592; Back to The Herald</a></p></div></body></html>
<?php
    exit;
}
?>
<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<title>The Herald &mdash; Admin</title>
<link href="https://fonts.googleapis.com/css2?family=Source+Code+Pro:wght@400;600&family=Libre+Baskerville:wght@700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:#0d0b08;font-family:'Source Code Pro',monospace;display:grid;place-items:center;min-height:100vh;padding:40px;color:#c8bfaa}
.frame{width:100%;max-width:680px;background:#111009;border:1px solid #2a231a;border-radius:10px;overflow:hidden;box-shadow:0 30px 60px rgba(0,0,0,.8)}
.bar{background:#1a1510;border-bottom:1px solid #2a231a;padding:11px 16px;display:flex;align-items:center;gap:8px}
.dot{width:12px;height:12px;border-radius:50%}
.dr{background:#ff5f57}.dy{background:#ffbd2e}.dg{background:#28c840}
.bt{flex:1;text-align:center;font-size:12px;color:#4a3f30}
.body{padding:30px 26px;line-height:1.8}
.prompt{color:#4a3f30;font-size:13px;margin-bottom:3px}
.prompt span{color:#b91c1c}
.out{color:#7a6e5a;font-size:12px;margin:4px 0 18px;white-space:pre-wrap;word-break:break-all}
.flag-box{background:rgba(185,28,28,.07);border:1px solid rgba(185,28,28,.3);border-radius:8px;padding:20px 22px;margin-top:20px}
.flag-lbl{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#4a3f30;margin-bottom:8px}
.flag-val{font-size:16px;font-weight:600;color:#e8d5a0;word-break:break-all;line-height:1.5}
.cur{display:inline-block;animation:blink 1s step-end infinite}
@keyframes blink{50%{opacity:0}}
a{color:#c9a84c;font-size:12px}
</style>
</head><body>
<div class="frame">
  <div class="bar">
    <div class="dot dr"></div><div class="dot dy"></div><div class="dot dg"></div>
    <div class="bt">root@herald-admin &mdash; bash</div>
  </div>
  <div class="body">
    <div class="prompt">$ <span>cat /proc/self/environ | tr '\0' '\n' | grep APP_SECRET</span></div>
    <div class="out">APP_SECRET=<?php echo htmlspecialchars($secret); ?></div>

    <div class="prompt">$ <span>php -r "echo hash_hmac('sha256','admin','<?php echo htmlspecialchars($secret); ?>');"</span></div>
    <div class="out"><?php echo htmlspecialchars($expected); ?></div>

    <div class="prompt">$ <span>cat /root/flag.txt</span></div>
    <div class="flag-box">
      <div class="flag-lbl">&#127937; Flag captured</div>
      <div class="flag-val"><?php echo htmlspecialchars($flag); ?></div>
    </div>
    <div style="margin-top:18px" class="prompt">$ <span class="cur">&#9608;</span></div>
    <div style="margin-top:20px"><a href="/">&#8592; Back to The Herald</a></div>
  </div>
</div>
</body></html>