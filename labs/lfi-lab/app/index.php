<?php
session_start();

/*
 * VULNERABILITY: Double URL-encoding bypass
 *
 * safe_page() calls urldecode() ONCE and checks for "../"
 * include() internally decodes the path a SECOND time.
 *
 * Bypass:
 *   Send: ?page=..%252f..%252f..%252fetc%252fpasswd
 *   safe_page() decodes %25 -> %  result: ..%2f..%2fetc%2fpasswd
 *   No "../" found -> PASSES filter
 *   include() decodes %2f -> /   result: ../../etc/passwd -> TRAVERSAL
 */
function safe_page($p) {
    $once = urldecode($p);
    if (strpos($once, '../')  !== false) return false;
    if (strpos($once, '..\\') !== false) return false;
    if (strpos(strtolower($once), '..%2f') !== false) return false;
    if (strpos(strtolower($once), '..%5c') !== false) return false;
    return true;
}

$raw = isset($_GET['page']) ? $_GET['page'] : 'home';

require_once __DIR__.'/includes/header.php';

if (!safe_page($raw)) {
    echo '<div class="warn-box">&#9888; Suspicious path detected. This attempt has been logged and reported.</div>';
} else {
    $resolved = __DIR__.'/pages/'.urldecode($raw).'.html';
    if (file_exists($resolved)) {
        echo file_get_contents($resolved);
    } else {
        // VULNERABLE: include() applies its own internal urldecode
        // Double-encoded traversal lands here and escapes the pages/ dir
        @include(__DIR__.'/pages/'.urldecode($raw));
    }
}

require_once __DIR__.'/includes/footer.php';