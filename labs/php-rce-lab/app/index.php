<?php
require_once __DIR__.'/includes/header.php';

$upload_dir = __DIR__.'/uploads/';
$raw_files  = array();
if (is_dir($upload_dir)) {
    foreach (scandir($upload_dir) as $f) {
        if ($f[0] !== '.' && $f !== '.htaccess' && $f !== '.gitkeep') {
            $raw_files[] = $f;
        }
    }
}

function file_icon($ext) {
    if (in_array($ext, array('jpg','jpeg','png','gif','webp','bmp'))) return '&#128444;';
    if ($ext === 'pdf') return '&#128196;';
    if ($ext === 'zip') return '&#128230;';
    if ($ext === 'txt') return '&#128221;';
    return '&#128206;';
}

function file_size($b) {
    if ($b < 1024)    return $b.' B';
    if ($b < 1048576) return round($b/1024,1).' KB';
    return round($b/1048576,1).' MB';
}
?>
<div class="ph">
  <div>
    <h1>My Files</h1>
    <p>Upload and manage your documents and media</p>
  </div>
</div>

<div class="card">
  <div class="ctitle">Upload a file</div>
  <form method="POST" action="/upload.php" enctype="multipart/form-data" id="upForm">
    <div id="dz" style="border:2px dashed var(--border2);border-radius:10px;padding:36px 20px;text-align:center;transition:border-color .2s,background .2s;cursor:pointer">
      <div style="font-size:36px;margin-bottom:10px">&#11014;&#65039;</div>
      <h3 style="font-size:15px;font-weight:600;margin-bottom:6px">Drop files here or browse</h3>
      <p style="font-size:13px;color:var(--muted);margin-bottom:16px">Secure upload with MIME-type validation and extension filtering</p>
      <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin-bottom:18px">
        <?php foreach (array('jpg','jpeg','png','gif','bmp','webp') as $t): ?>
        <span style="padding:3px 10px;background:var(--bg);border:1px solid var(--border);border-radius:20px;font-size:11px;font-family:'IBM Plex Mono',monospace;color:var(--muted)">.<?php echo $t; ?></span>
        <?php endforeach; ?>
      </div>
      <label for="fInput" style="cursor:pointer">
        <span class="btn btng" style="pointer-events:none">Choose File</span>
      </label>
      <input type="file" name="upload" id="fInput" style="display:none">
      <div id="fname" style="font-size:12px;color:var(--muted);margin-top:10px;font-family:'IBM Plex Mono',monospace">No file selected</div>
    </div>
    <div style="display:flex;justify-content:flex-end;margin-top:14px">
      <button type="submit" class="btn btnb">Upload &rarr;</button>
    </div>
  </form>
</div>

<div class="card">
  <div class="ctitle">Uploaded Files (<?php echo count($raw_files); ?>)</div>
  <?php if (empty($raw_files)): ?>
  <div style="padding:40px;text-align:center;color:var(--muted)">
    <div style="font-size:36px;margin-bottom:10px">&#128237;</div>
    <p style="font-size:14px">No files yet. Upload your first file above.</p>
  </div>
  <?php else: ?>
  <?php foreach ($raw_files as $f):
    $ext  = strtolower(pathinfo($f, PATHINFO_EXTENSION));
    $fp   = $upload_dir.$f;
    $size = file_exists($fp) ? filesize($fp) : 0;
  ?>
  <div style="display:flex;align-items:center;gap:14px;padding:13px 0;border-bottom:1px solid var(--border)">
    <div style="width:38px;height:38px;background:var(--bg);border:1px solid var(--border);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">
      <?php echo file_icon($ext); ?>
    </div>
    <div style="flex:1;min-width:0">
      <div style="font-size:14px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><?php echo htmlspecialchars($f); ?></div>
      <div style="font-size:12px;color:var(--muted);font-family:'IBM Plex Mono',monospace;margin-top:2px"><?php echo file_size($size); ?> &middot; <?php echo strtoupper($ext ? $ext : '?'); ?></div>
    </div>
    <div style="display:flex;gap:8px">
      <a href="/viewer.php?file=<?php echo urlencode($f); ?>" style="padding:5px 14px;border-radius:6px;font-size:12px;font-weight:600;background:var(--bbg);color:var(--blue);border:1px solid var(--brim);text-decoration:none">View &rarr;</a>
      <a href="/uploads/<?php echo urlencode($f); ?>" target="_blank" style="padding:5px 14px;border-radius:6px;font-size:12px;font-weight:600;background:var(--bg);color:var(--ink2);border:1px solid var(--border);text-decoration:none">Open</a>
    </div>
  </div>
  <?php endforeach; ?>
  <?php endif; ?>
</div>

<script>
var inp = document.getElementById('fInput');
var lbl = document.getElementById('fname');
var dz  = document.getElementById('dz');
inp.onchange = function(){ lbl.textContent = inp.files[0] ? inp.files[0].name : 'No file selected'; };
dz.addEventListener('dragenter', function(e){ e.preventDefault(); dz.style.borderColor='var(--blue)'; dz.style.background='var(--bbg)'; });
dz.addEventListener('dragover',  function(e){ e.preventDefault(); });
dz.addEventListener('dragleave', function(e){ e.preventDefault(); dz.style.borderColor=''; dz.style.background=''; });
dz.addEventListener('drop', function(e){
  e.preventDefault(); dz.style.borderColor=''; dz.style.background='';
  var f = e.dataTransfer.files[0];
  if(f){ var dt=new DataTransfer(); dt.items.add(f); inp.files=dt.files; lbl.textContent=f.name; }
});
</script>
<?php require_once __DIR__.'/includes/footer.php'; ?>