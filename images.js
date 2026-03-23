// ══ IMAGES ══

var _unitImgFiles = [];

function previewUnitImgs(input) {
  _unitImgFiles = Array.from(input.files || []);
  var preview = document.getElementById('unit-imgs-preview');
  if(!preview) return;
  preview.innerHTML = '';
  _unitImgFiles.forEach(function(file, i){
    var reader = new FileReader();
    reader.onload = function(e) {
      var wrap = document.createElement('div');
      wrap.style.cssText = 'position:relative;width:70px;height:70px';

      var img = document.createElement('img');
      img.src = e.target.result;
      img.alt = file.name || 'unit image';
      img.style.cssText = 'width:70px;height:70px;object-fit:cover;border-radius:8px;border:2px solid var(--border)';

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'danger-icon-btn';
      btn.style.cssText = 'position:absolute;top:-4px;right:-4px';
      btn.textContent = '×';
      btn.addEventListener('click', function(){ removeUnitImg(i); });

      wrap.appendChild(img);
      wrap.appendChild(btn);
      preview.appendChild(wrap);
    };
    reader.readAsDataURL(file);
  });
}

function removeUnitImg(idx) {
  _unitImgFiles.splice(idx,1);
  previewUnitImgs({files: _unitImgFiles});
}

async function uploadUnitImages(unitId) {
  if(!_unitImgFiles.length) return [];
  try {
    var urls = [];
    for(var file of _unitImgFiles) {
      var base64 = await new Promise(function(res, rej){
        var r = new FileReader();
        r.onload = function(){ res(r.result); };
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      var result = await sb.from('unit_images').insert({
        unit_id: unitId,
        image_data: base64,
        file_name: file.name,
        created_at: new Date().toISOString()
      });
      if(!result.error) urls.push(base64);
    }
    return urls;
  } catch(e) {
    // image upload skipped silently
    return [];
  }
}

async function loadUnitImages(unitId) {
  try {
    var result = await sb.from('unit_images').select('id,image_data,file_name,created_at')
      .eq('unit_id', unitId).order('created_at');
    return result.data || [];
  } catch(e) { return []; }
}

window.previewUnitImgs=previewUnitImgs; window.removeUnitImg=removeUnitImg; window.uploadUnitImages=uploadUnitImages; window.loadUnitImages=loadUnitImages;
