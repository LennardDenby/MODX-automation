(function () {
  'use strict';

  if (!document.querySelector('.modx-tv-caption')) return;

  function getApiKey() {
    try {
      if (chrome && chrome.storage && chrome.storage.local) {
        return new Promise(function (resolve) {
          chrome.storage.local.get(['geminiApiKey'], function (data) {
            resolve(data.geminiApiKey || window.GEMINI_API_KEY || '');
          });
        });
      }
    } catch (e) {}
    return Promise.resolve(window.GEMINI_API_KEY || '');
  }

  function resolveImageUrl(src) {
    if (/^https?:/.test(src)) return src;
    return location.origin + (src[0] === '/' ? '' : '/') + src;
  }

  async function fetchImageAsBase64(url) {
    var resp = await fetch(url, { credentials: 'include' });
    if (!resp.ok) throw new Error('Failed to fetch image: ' + resp.status);
    var blob = await resp.blob();
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result.split(',')[1]); };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function cacheKey(url) {
    var a = url.indexOf('/_thumbs/');
    if (a !== -1) url = url.slice(a);
    var b = url.indexOf('phpthumb.php?');
    if (b !== -1) url = url.slice(b);
    return 'altcache_' + url;
  }

  function getCached(key) {
    return new Promise(function (resolve) {
      chrome.storage.local.get([key], function (data) {
        resolve(data[key] || null);
      });
    });
  }

  function setCache(key, value) {
    var obj = {};
    obj[key] = value;
    chrome.storage.local.set(obj);
  }

  async function getOrGenerateAltText(imageUrl, apiKey) {
    var key = cacheKey(imageUrl);
    var cached = await getCached(key);
    if (cached) return { alt: cached, cached: true };

    var alt = await generateAltText(imageUrl, apiKey);
    setCache(key, alt);
    return { alt: alt, cached: false };
  }

  async function generateAltText(imageUrl, apiKey) {
    var base64 = await fetchImageAsBase64(imageUrl);

    var resp = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=' + apiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: 'Write short alt text for this image in English and Norwegian. Return ONLY a JSON object: {"en":"english alt text","no":"norsk alt tekst"}' },
              { inlineData: { mimeType: 'image/jpeg', data: base64 } }
            ]
          }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 256 }
        })
      }
    );

    var data = await resp.json();
    if (data.error) throw new Error(data.error.message);

    var raw = (data.candidates[0].content.parts[0].text || '').trim();
    raw = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    return JSON.parse(raw);
  }

  function escapeHtml(s) {
    var el = document.createElement('span');
    el.textContent = s;
    return el.innerHTML;
  }

  function escapeAttr(s) {
    return (s || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function injectButtons() {
    var images = document.querySelectorAll(
      '.contentblocks-field-moregallery-image-selector img, ' +
      '.imageplus-image-preview img, ' +
      '.modx-tv-image-preview img'
    );

    for (var i = 0; i < images.length; i++) {
      var img = images[i];
      if (img.dataset.altBtnInjected) continue;
      img.dataset.altBtnInjected = '1';

      var wrapper = img.closest('.mg-image-selector-input-image') ||
                    img.closest('.modx-tv-image-preview') ||
                    img.parentElement;

      var btn = document.createElement('button');
      btn.textContent = 'Generate alt text';
      btn.title = 'Generate alt text';
      btn.style.cssText = 'margin:2px 4px;padding:1px 5px;font-size:9px;cursor:pointer;background:#4a90d9;color:#fff;border:none;border-radius:2px;';

      var result = document.createElement('div');
      result.style.cssText = 'margin:2px 0;padding:4px 6px;font-size:11px;line-height:1.5;background:#f0f4f8;border-radius:3px;display:none;white-space:normal;max-width:300px;';

      btn.addEventListener('click', async function () {
        btn.disabled = true;
        btn.textContent = '...';
        result.style.display = 'block';
        result.textContent = 'Working...';

        try {
          var apiKey = await getApiKey();
          if (!apiKey) { result.textContent = 'No API key set.'; return; }
          var imageUrl = resolveImageUrl(img.src);
          var res = await getOrGenerateAltText(imageUrl, apiKey);
          var alt = res.alt;
          var cachedTag = res.cached ? ' <span style="color:#aaa;font-size:9px">(cached)</span>' : '';
          result.innerHTML =
            '<div style="margin-bottom:3px"><b>en:</b> ' + escapeHtml(alt.en) +
            ' <button class="copyAltBtn" data-text="' + escapeAttr(alt.en) + '" style="padding:0 4px;font-size:9px;cursor:pointer">copy</button></div>' +
            '<div><b>no:</b> ' + escapeHtml(alt.no) +
            ' <button class="copyAltBtn" data-text="' + escapeAttr(alt.no) + '" style="padding:0 4px;font-size:9px;cursor:pointer">copy</button></div>' +
            cachedTag;
        } catch (e) {
          result.textContent = 'Error: ' + e.message;
        } finally {
          btn.disabled = false;
          btn.textContent = 'Lennard er best <3';
        }
      });

      wrapper.appendChild(btn);
      wrapper.appendChild(result);
    }
  }

  injectButtons();

  document.body.addEventListener('click', function (e) {
    var btn = e.target.closest('.copyAltBtn');
    if (!btn) return;
    navigator.clipboard.writeText(btn.dataset.text).then(function () {
      var orig = btn.textContent;
      btn.textContent = '✓';
      setTimeout(function () { btn.textContent = orig; }, 800);
    });
  });

  new MutationObserver(function () {
    injectButtons();
  }).observe(document.body, { childList: true, subtree: true });
})();
