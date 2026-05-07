<?php require_once __DIR__.'/includes/header.php'; ?>
<div class="ph"><div><h1>Help &amp; Documentation</h1><p>Platform guidelines and security policy</p></div></div>

<div class="card">
  <div class="ctitle">Upload Security Policy</div>
  <p style="font-size:14px;color:var(--ink2);line-height:1.75;margin-bottom:20px">CloudDrop uses a two-stage upload security system:</p>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:20px">
      <div style="font-size:20px;margin-bottom:10px">&#128269;</div>
      <h4 style="font-size:14px;font-weight:600;margin-bottom:8px">Stage 1 &mdash; Extension Filter</h4>
      <p style="font-size:13px;color:var(--muted);line-height:1.6">
        Dangerous script extensions are blocked: <code>.php</code>, <code>.php3</code>, <code>.php4</code>, <code>.php5</code>, <code>.php7</code>, <code>.phar</code>, <code>.sh</code>, <code>.py</code>, <code>.cgi</code> and others.
      </p>
    </div>
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:20px">
      <div style="font-size:20px;margin-bottom:10px">&#129516;</div>
      <h4 style="font-size:14px;font-weight:600;margin-bottom:8px">Stage 2 &mdash; MIME Validation</h4>
      <p style="font-size:13px;color:var(--muted);line-height:1.6">
        File content is inspected using <code>mime_content_type()</code>. Only accepted: <code>image/jpeg</code>, <code>image/png</code>, <code>image/gif</code>, <code>image/bmp</code>, <code>image/webp</code>.
      </p>
    </div>
  </div>
  <div style="background:var(--obg);border:1px solid var(--orim);border-radius:8px;padding:14px 16px;font-size:13px;color:var(--orange)">
    &#9888;&#65039; <strong>Admin note:</strong> The <code>/uploads</code> directory uses a custom <code>.htaccess</code> configuration for legacy compatibility. Review before production deployment.
  </div>
</div>

<div class="card">
  <div class="ctitle">FAQ</div>
  <?php $faqs = array(
    array('What formats are supported?', 'JPG, JPEG, PNG, GIF, BMP, and WEBP. Both extension and content are validated.'),
    array('Why was my file rejected?', 'Either the extension is in our blocklist, or the file content is not a recognised image format.'),
    array('Where are files stored?', 'Files are stored in the /uploads directory and are accessible at /uploads/filename.'),
    array('Is there a file size limit?', 'Yes, 4 MB per upload.'),
  );
  foreach ($faqs as $faq): ?>
  <div style="padding:16px 0;border-bottom:1px solid var(--border)">
    <h4 style="font-size:14px;font-weight:600;margin-bottom:6px">&#10067; <?php echo $faq[0]; ?></h4>
    <p style="font-size:13px;color:var(--muted);line-height:1.65"><?php echo $faq[1]; ?></p>
  </div>
  <?php endforeach; ?>
</div>
<?php require_once __DIR__.'/includes/footer.php'; ?>