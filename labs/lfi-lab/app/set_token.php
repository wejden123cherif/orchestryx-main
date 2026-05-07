<?php
session_start();
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $t = trim(isset($_POST['token']) ? $_POST['token'] : '');
    if (preg_match('/^[a-f0-9]{64}$/', $t)) {
        $_SESSION['admin_token'] = $t;
        header('Location: /admin.php');
        exit;
    }
}
http_response_code(400);
echo 'Invalid token. Must be a 64-character lowercase hex string.';