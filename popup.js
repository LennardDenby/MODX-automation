const status = document.getElementById('status');
const stored = document.getElementById('stored');
const tableWrap = document.getElementById('tableWrap');
const table = document.getElementById('table');
const settings = document.getElementById('settings');
const apiKeyInput = document.getElementById('apiKeyInput');

const COLUMNS = [
  { field: '40', label: 'Day' },
  { field: '41', label: 'Title' },
  { field: '42', label: 'Accomm.' },
  { field: '43', label: 'Meals' },
  { field: '44', label: 'Transport' },
  { field: '45', label: 'Duration' },
  { field: '46', label: 'Ascent/Descent' },
  { field: '47', label: 'Distance' },
  { field: '48', label: 'Coordinates' },
  { field: '50', label: 'Text' },
];

const TRANSLATE_FIELDS = ['41', '50', '42', '44'];

function mealsMap(value) {
  var mapping = { F: 'B', L: 'L', M: 'D' };
  return value.split(',').map(function (s) {
    var k = s.trim();
    return mapping[k] || k;
  }).join(',');
}

function durationMap(value) {
  return value
    .replace(/\btimer\b/gi, 'hours')
    .replace(/\bminutter\b/gi, 'minutes')
    .replace(/\bmin\b/gi, 'min')
    .replace(/\bog\b/gi, 'and');
}

function getApiKey() {
  var k = (window.GEMINI_API_KEY || '').trim();
  if (k) return k;
  return null;
}

async function translateDays(days, apiKey) {
  var texts = [];
  for (var d = 0; d < days.length; d++) {
    var day = days[d];
    for (var f = 0; f < TRANSLATE_FIELDS.length; f++) {
      var field = TRANSLATE_FIELDS[f];
      var entry = day[field];
      if (entry && entry.value && entry.value.trim()) {
        texts.push({ dayIndex: d, field: field, text: entry.value.trim() });
      }
    }
  }

  if (texts.length === 0) return;

  var prompt = 'Translate these Norwegian words/phrases to American English. Return ONLY the English translation for each, one per line, in the same order. Do not add numbers, prefixes, or explanations.\n';
  prompt += 'When text includes "xxxx moh", translate into this format: "xxxx m", do not convert to feet, and avoid comma or space between numbers. Example: (2460 moh) → (2460 m).\n';
  prompt += 'Do not use "tour", use "trip" instead.\n';
  prompt += 'For currency use ISO 4217 codes after the number.\n\n';
  for (var i = 0; i < texts.length; i++) {
    prompt += (i + 1) + '. ' + texts[i].text + '\n';
  }

  var resp = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=' + apiKey,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 8192 }
      })
    }
  );

  var data = await resp.json();
  if (data.error) throw new Error(data.error.message);

  var lines = (data.candidates[0].content.parts[0].text || '').split('\n').filter(function (l) { return l.trim(); });

  for (var i = 0; i < Math.min(lines.length, texts.length); i++) {
    var t = texts[i];
    var translation = lines[i].replace(/^\d+\.?\s*/, '').trim();
    if (translation) days[t.dayIndex][t.field].en = translation;
  }
}

// ponytail: runs in page's MAIN world via chrome.scripting.executeScript, bypasses CSP
function addDayWithData(day) {
  var FIELD_MAP = {
    '40': ['day_number'],
    '41': ['en_daytitle', 'web_daytitle'],
    '42': ['en_accommodation', 'web_accommodation'],
    '43': ['en_meals', 'web_meals'],
    '44': ['en_transportation', 'web_transportation'],
    '45': ['en_duration', 'web_duration'],
    '46': ['ascdesc'],
    '47': ['distance'],
    '48': ['coords'],
    '49': ['gallery'],
    '50': ['en_text', 'web_text'],
  };

  var captions = document.querySelectorAll('.modx-tv-caption');
  var gridId = null;
  for (var i = 0; i < captions.length; i++) {
    if (captions[i].textContent.trim() === 'Day By Day') {
      var cid = captions[i].id;
      var tvNum = cid.replace('tv', '').split('-')[0];
      gridId = 'tv' + tvNum + '_items';
      break;
    }
  }
  if (!gridId) return { ok: false, error: 'Day By Day section not found.' };

  try {
    var grid = Ext.getCmp(gridId);
    if (!grid || typeof grid.addNewItem !== 'function') return { ok: false, error: 'Grid not available.' };
  } catch (e) { return { ok: false, error: e.message }; }

  // ponytail: build record manually to avoid addNewItem's internal collectItems race
  var item = {};
  var filled = 0;
  for (var df in day) {
    var fields = FIELD_MAP[df];
    if (!fields) continue;
    var val = day[df].value;
    for (var j = 0; j < fields.length; j++) {
      if (fields[j].indexOf('en_') === 0 && day[df].en) {
        item[fields[j]] = day[df].en;
      } else {
        item[fields[j]] = val;
      }
    }
    filled++;
  }

  var s = grid.getStore();
  grid.autoinc = parseInt(grid.autoinc) + 1;
  s.loadData([item], true); // append to store

  var idx = s.getCount() - 1;
  var rec = s.getAt(idx);
  item.MIGX_id = grid.autoinc;
  rec.set('MIGX_id', grid.autoinc);
  rec.json = item;

  for (var key in item) {
    if (key !== 'MIGX_id') rec.set(key, item[key]);
  }

  grid.getView().refresh();
  grid.call_collectmigxitems = true;
  grid.collectItems();

  var title = day['41'] ? day['41'].value : (day['40'] ? day['40'].value : '');
  return { ok: true, message: 'Added day "' + title + '" (' + filled + ' fields)' };
}

function setStatus(msg, isError) {
  status.innerHTML = escapeHtml(msg);
  status.className = isError ? 'error' : 'success';
}

function setLoading(msg) {
  status.innerHTML = '<span class="spinner"></span>' + escapeHtml(msg);
  status.className = '';
}

async function sendToTab(msg) {
  var [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return await chrome.tabs.sendMessage(tab.id, msg);
}

function renderTable(days) {
  if (!days || days.length === 0) {
    tableWrap.style.display = 'none';
    return;
  }

  var html = '<thead><tr><th></th>';
  for (var c = 0; c < COLUMNS.length; c++) {
    html += '<th>' + COLUMNS[c].label + '</th>';
  }
  html += '</tr></thead><tbody>';

  for (var i = 0; i < days.length; i++) {
    var day = days[i];
    html += '<tr>';
    html += '<td><button class="addDayBtn" data-index="' + i + '">Add</button></td>';
    for (var c = 0; c < COLUMNS.length; c++) {
      var val = day[COLUMNS[c].field]?.value || '';
      html += '<td title="' + escapeAttr(val) + '">' + escapeHtml(val) + '</td>';
    }
    html += '</tr>';

    var hasEn = false;
    for (var c = 0; c < COLUMNS.length; c++) {
      if (day[COLUMNS[c].field]?.en) { hasEn = true; break; }
    }
    if (hasEn) {
      html += '<tr class="enRow"><td>EN</td>';
      for (var c = 0; c < COLUMNS.length; c++) {
        var enVal = day[COLUMNS[c].field]?.en || '';
        html += '<td title="' + escapeAttr(enVal) + '">' + escapeHtml(enVal) + '</td>';
      }
      html += '</tr>';
    }
  }
  html += '</tbody>';

  table.innerHTML = html;
  tableWrap.style.display = 'block';
}

function escapeHtml(s) {
  var el = document.createElement('span');
  el.textContent = s;
  return el.innerHTML;
}

function escapeAttr(s) {
  return (s || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

table.addEventListener('click', async (e) => {
  var btn = e.target.closest('.addDayBtn');
  if (!btn) return;

  var dayIndex = parseInt(btn.dataset.index);
  btn.disabled = true;
  setStatus('Adding day ' + (dayIndex + 1) + '...', false);

  try {
    var [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    var storedData = await new Promise(function (r) { chrome.storage.local.get(['days'], r); });
    var day = storedData.days[dayIndex];

    var [injectionResult] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: addDayWithData,
      args: [day],
    });

    if (injectionResult.result.ok) setStatus(injectionResult.result.message, false);
    else setStatus(injectionResult.result.error, true);
  } catch (e) {
    setStatus(e.message || 'Could not reach page.', true);
  }
  btn.disabled = false;
});

document.getElementById('copyBtn').addEventListener('click', async () => {
  setStatus('Copying...', false);
  try {
    var res = await sendToTab({ action: 'copy' });
    if (!res.ok) { setStatus(res.error, true); return; }

    setLoading('Translating...');

    var data = await new Promise(function (r) { chrome.storage.local.get(['days', 'title'], r); });
    var days = data.days;

    for (var i = 0; i < days.length; i++) {
      if (days[i]['43']) days[i]['43'].en = mealsMap(days[i]['43'].value);
      if (days[i]['45']) days[i]['45'].en = durationMap(days[i]['45'].value);
    }

    var apiKey = getApiKey();
    if (apiKey) {
      try {
        await translateDays(days, apiKey);
      } catch (e) {
        setStatus('Translation failed: ' + (e.message || 'unknown error') + '. Norwegian stored only.', true);
        chrome.storage.local.set({ days: days, count: days.length }, function () { loadStored(); });
        return;
      }
    }

    chrome.storage.local.set({ days: days, count: days.length }, function () {
      setStatus('Copied ' + days.length + ' days.', false);
      loadStored();
    });
  } catch (e) {
    setStatus(e.message || 'Could not reach page. Reload it and try again.', true);
  }
});

document.getElementById('clearBtn').addEventListener('click', () => {
  chrome.storage.local.remove(['days', 'count', 'title', 'url'], () => {
    setStatus('Cleared.', false);
    loadStored();
  });
});

document.getElementById('pasteBtn').addEventListener('click', async () => {
  try {
    var [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    var storedData = await new Promise(function (r) { chrome.storage.local.get(['days'], r); });
    var days = storedData.days;

    if (!days || days.length === 0) {
      setStatus('No days stored.', true);
      return;
    }

    for (var i = 0; i < days.length; i++) {
      setLoading('Adding day ' + (i + 1) + '/' + days.length + '...');

      var [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: addDayWithData,
        args: [days[i]],
      });

      if (!result.result.ok) {
        setStatus('Failed at day ' + (i + 1) + ': ' + result.result.error, true);
        return;
      }

      await new Promise(function (r) { setTimeout(r, 800); });
    }

    setStatus('Pasted all ' + days.length + ' days.', false);
  } catch (e) {
    setStatus(e.message || 'Error during paste.', true);
  }
});

document.getElementById('saveKeyBtn').addEventListener('click', () => {
  var key = apiKeyInput.value.trim();
  if (!key) return;
  window.GEMINI_API_KEY = key;
  chrome.storage.local.set({ geminiApiKey: key }, function () {
    settings.style.display = 'none';
    setStatus('API key saved.', false);
  });
});

function loadApiKey() {
  if (getApiKey()) { settings.style.display = 'none'; return; }
  chrome.storage.local.get(['geminiApiKey'], function (data) {
    if (data.geminiApiKey) {
      window.GEMINI_API_KEY = data.geminiApiKey;
      settings.style.display = 'none';
    } else {
      settings.style.display = 'flex';
    }
  });
}

function loadStored() {
  chrome.storage.local.get(['count', 'title', 'days'], function (data) {
    if (data.count) {
      stored.textContent = 'Stored: ' + data.count + ' days from "' + data.title + '"';
      renderTable(data.days);
    } else {
      stored.textContent = 'No days stored yet.';
      tableWrap.style.display = 'none';
    }
  });
}

loadApiKey();
loadStored();
