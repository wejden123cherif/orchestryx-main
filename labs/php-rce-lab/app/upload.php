<?php
session_start();

/* ── Upload validation ────────────────────────────────────────────────
   BLACKLIST approach — .phtml is intentionally NOT in the blocked list.
   MIME check uses mime_content_type() which only reads magic bytes.
   Bypass: prepend GIF89a to PHP code → file named shell.phtml
     → ext "phtml" not blocked ✓
     → mime_content_type returns "image/gif" ✓
     → saved to uploads/
     → uploads/.htaccess allows PHP for .phtml only → code executes
   ─────────────────────────────────────────────────────────────────── */

$blocked = array('php','php3','php4','php5','php7','phar','shtml','cgi','pl','py','rb','sh','bash');
$ok_mime  = array('image/jpeg','image/png','image/gif','image/bmp','image/webp');

if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !isset($_FILES['upload'])) {
    header('Location: /index.php'); exit;
}

$file = $_FILES['upload'];
$err  = null;

if ($file['error'] !== UPLOAD_ERR_OK) {
    $err = 'Upload error (code '.$file['error'].').';
} else {
    $name = $file['name'];
    $ext  = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    $mime = mime_content_type($file['tmp_name']);

    if (in_array($ext, $blocked)) {
        $err = 'Extension .'.$ext.' is not permitted. Only image files are allowed.';
    } elseif (!in_array($mime, $ok_mime)) {
        $err = 'File content rejected (detected: '.$mime.'). Only image files are accepted.';
    } else {
        $safe = preg_replace('/[^a-zA-Z0-9._-]/', '_', basename($name));
        $dest = __DIR__.'/uploads/'.$safe;
        if (move_uploaded_file($file['tmp_name'], $dest)) {
            $_SESSION['flash'] = 'File <strong>'.htmlspecialchars($safe).'</strong> uploaded successfully.';
            $_SESSION['ftype'] = 'success';
        } else {
            $err = 'Server error: could not save the file. Check permissions.';
        }
    }
}

if ($err) {
    $_SESSION['flash'] = $err;
    $_SESSION['ftype'] = 'error';
}

header('Location: /index.php');
exit;