<?php
require_once __DIR__.'/includes/header.php';

$file   = basename(isset($_GET['file']) ? $_GET['file'] : '');
$path   = __DIR__.'/uploads/'.$file;
$exists = ($file !== '' && file_exists($path) && is_file($path));
$ext    = $exists ? strtolower(pathinfo($file, PATHINFO_EXTENSION)) : '';
$size   = $exists ? filesize($path) : 0;
$is_img = in_array($ext, array('jpg','jpeg','png','gif','bmp','webp'));

function sz($b) {
    if ($b < 1024)    return $b.' B';
    if ($b < 1048576) return round($b/1024,1).' KB';
    return round($b/1048576,1).' MB';
}
?>
<div class="ph">
  <div>
    <h1>File Details</h1>
    <p><a href="/index.php" style="color:var(--blue);text-decoration:none">&larr; Back to My Files</a></p>
  </div>
</div>

<?php if (!$exists): ?>
<div class="card" style="text-align:center;padding:60px">
  <div style="font-size:48px;margin-bottom:16px">&#128269;</div>
  <h3 style="margin-bottom:8px">File not found</h3>
  <p style="color:var(--muted);font-size:14px">This file does not exist or has been removed.</p>
  <div style="margin-top:20px"><a href="/index.php" class="btn btnb">Back to Files</a></div>
</div>
<?php else: ?>
<div style="display:grid;grid-template-columns:1fr 300px;gap:20px;align-items:start">
  <div class="card">
    <div class="ctitle">Preview</div>
    <?php if ($is_img): ?>
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:20px;text-align:center;min-height:200px;display:flex;align-items:center;justify-content:center">
      <img src="/uploads/<?php echo urlencode($file); ?>" alt="<?php echo htmlspecialchars($file); ?>" style="max-width:100%;max-height:400px;border-radius:4px">
    </div>
    <?php else: ?>
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:40px;text-align:center;color:var(--muted)">
      <div style="font-size:48px;margin-bottom:12px">&#128206;</div>
      <p style="font-size:13px">No preview for .<?php echo htmlspecialchars($ext); ?> files.</p>
      <div style="margin-top:16px"><a href="/uploads/<?php echo urlencode($file); ?>" target="_blank" class="btn btnb">Open File &#8599;</a></div>
    </div>
    <?php endif; ?>
  </div>
  <div>
    <div class="card">
      <div class="ctitle">File Information</div>
      <?php
      $info = array(
          'Filename' => htmlspecialchars($file),
          'Type'     => strtoupper($ext ? $ext : '?'),
          'Size'     => sz($size),
          'Uploaded' => date('M j, Y H:i', filemtime($path)),
          'Path'     => '/uploads/'.htmlspecialchars($file),
      );
      foreach ($info as $k => $v):
      ?>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:9px 0;border-bottom:1px solid var(--border);gap:12px">
        <span style="font-size:13px;color:var(--muted);flex-shrink:0"><?php echo $k; ?></span>
        <span style="font-size:12px;font-family:'IBM Plex Mono',monospace;word-break:break-all;text-align:right"><?php echo $v; ?></span>
      </div>
      <?php endforeach; ?>
    </div>
    <div class="card">
      <div class="ctitle">Actions</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <a href="/uploads/<?php echo urlencode($file); ?>" target="_blank" class="btn btnb" style="text-align:center">Open in New Tab &#8599;</a>
        <a href="/index.php" class="btn btng" style="text-align:center">&larr; Back to Files</a>
      </div>
    </div>
  </div>
</div>
<?php endif; ?>
<?php require_once __DIR__.'/includes/footer.php'; ?>