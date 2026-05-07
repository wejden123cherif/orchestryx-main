<?php
session_start();
if (!empty($_SESSION['user'])) { header('Location: /dashboard.php'); exit; }

function waf($s) {
    $p = array(
        '/\bor\b\s+[\'"\d]/i',
        '/\band\b\s+[\'"\d]/i',
        '/--(?!\s)/',
        '/#\s*$/',
        '/\/\*/',
        '/sleep\s*\(/i',
        '/benchmark\s*\(/i',
        '/load_file\s*\(/i',
        '/into\s+outfile\b/i',
    );
    foreach ($p as $pat) if (preg_match($pat, $s)) return false;
    return true;
}

$error = '';
$conn  = new mysqli('127.0.0.1','appuser','C0rpApp2024','corpdb');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $u = trim($_POST['username'] ?? '');
    $pw = trim($_POST['password'] ?? '');
    if (!waf($u) || !waf($pw)) {
        $error = 'Input blocked by WAF [ERR-001]. Attempt has been logged.';
    } else {
        $sql = "SELECT id,username,full_name,department,position,access_level,joined_date
                FROM employees WHERE username='$u' AND password=MD5('$pw')";
        $res = $conn->query($sql);
        if ($res && $res->num_rows > 0) {
            $_SESSION['user'] = $res->fetch_assoc();
            header('Location: /dashboard.php'); exit;
        }
        $error = 'Invalid credentials. Access denied.';
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>NexBank &mdash; Secure Login</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=DM+Sans:wght@300;400;500&family=DM+Mono&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--ink:#09090b;--surface:#111318;--panel:#18191f;--rim:#27293a;--gold:#c9a84c;--gdim:#9e7e35;--gglow:rgba(201,168,76,.12);--silver:#8b95a8;--text:#e8eaf2;--muted:#555d70}
html,body{height:100%}
body{font-family:'DM Sans',sans-serif;background:var(--ink);color:var(--text);display:grid;grid-template-columns:1fr 1fr;min-height:100vh}
.left{background:var(--surface);border-right:1px solid var(--rim);display:flex;flex-direction:column;justify-content:center;padding:80px 64px;position:relative;overflow:hidden}
.left::before{content:'';position:absolute;top:-100px;left:-60px;width:440px;height:440px;background:radial-gradient(circle,rgba(201,168,76,.07) 0%,transparent 70%);pointer-events:none}
.brand{display:flex;align-items:center;gap:12px;margin-bottom:64px}
.mark{width:42px;height:42px;border:2px solid var(--gold);border-radius:10px;display:grid;place-items:center;font-family:'Playfair Display',serif;font-size:19px;color:var(--gold)}
.bname{font-family:'Playfair Display',serif;font-size:21px;font-weight:500;color:var(--text)}
.bname sup{font-size:8px;color:var(--gold);letter-spacing:2px;font-family:'DM Sans',sans-serif;margin-left:2px}
.left h1{font-family:'Playfair Display',serif;font-size:40px;font-weight:700;line-height:1.2;margin-bottom:18px}
.left h1 em{color:var(--gold);font-style:normal}
.left p{font-size:14px;color:var(--silver);line-height:1.75;max-width:360px}
.badges{display:flex;gap:8px;margin-top:44px;flex-wrap:wrap}
.badge{padding:4px 12px;border:1px solid var(--rim);border-radius:20px;font-size:11px;color:var(--muted);font-family:'DM Mono',monospace}
.badge.g{border-color:rgba(201,168,76,.4);color:var(--gold);background:var(--gglow)}
.right{display:flex;flex-direction:column;justify-content:center;align-items:center;padding:60px 40px;background:var(--ink)}
.card{width:100%;max-width:400px}
.card h2{font-family:'Playfair Display',serif;font-size:26px;font-weight:500;margin-bottom:6px}
.card .sub{font-size:13px;color:var(--silver);margin-bottom:32px}
.field{margin-bottom:18px}
.field label{display:block;font-size:11px;font-weight:500;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:7px}
.field input{width:100%;padding:12px 15px;background:var(--panel);border:1px solid var(--rim);border-radius:8px;color:var(--text);font-family:'DM Sans',sans-serif;font-size:14px;outline:none;transition:border-color .2s,box-shadow .2s}
.field input:focus{border-color:var(--gold);box-shadow:0 0 0 3px var(--gglow)}
.field input::placeholder{color:var(--muted)}
.submit{width:100%;padding:13px;background:var(--gold);border:none;border-radius:8px;color:#000;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:500;cursor:pointer;margin-top:4px;transition:background .2s}
.submit:hover{background:#d4b058}
.err{padding:11px 15px;border-radius:8px;font-size:13px;margin-top:14px;background:rgba(224,85,85,.08);border:1px solid rgba(224,85,85,.25);color:#e07070;display:flex;gap:8px}
.err::before{content:'⚠ '}
.divider{height:1px;background:var(--rim);margin:24px 0}
.notice{font-size:12px;color:var(--muted);line-height:1.65;text-align:center}
.notice strong{color:var(--silver)}
@media(max-width:768px){body{grid-template-columns:1fr}.left{display:none}.right{padding:40px 24px}}
</style>
</head>
<body>
<div class="left">
  <div class="brand">
    <div class="mark">N</div>
    <div class="bname">NexBank <sup>CORP</sup></div>
  </div>
  <h1>Secure<br>Employee <em>Portal</em></h1>
  <p>Internal banking platform for authorized NexBank staff. All sessions are monitored and recorded.</p>
  <div class="badges">
    <span class="badge g">ISO 27001</span>
    <span class="badge">TLS 1.3</span>
    <span class="badge">SOC 2</span>
    <span class="badge">AES-256</span>
  </div>
</div>
<div class="right">
  <div class="card">
    <h2>Sign in</h2>
    <p class="sub">Use your corporate credentials to access the portal.</p>
    <form method="POST" autocomplete="off">
      <div class="field">
        <label>Corporate Username</label>
        <input type="text" name="username" placeholder="firstname.lastname" spellcheck="false">
      </div>
      <div class="field">
        <label>Password</label>
        <input type="password" name="password" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;">
      </div>
      <button class="submit" type="submit">Access Portal &rarr;</button>
    </form>
    <?php if ($error): ?>
    <div class="err"><?php echo htmlspecialchars($error); ?></div>
    <?php endif; ?>
    <div class="divider"></div>
    <p class="notice"><strong>Security Notice:</strong> Unauthorized access is a criminal offence. Protected by an adaptive Web Application Firewall.</p>
  </div>
</div>
</body>
</html>