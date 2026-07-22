const status = document.getElementById('status');
const stored = document.getElementById('stored');
const tableWrap = document.getElementById('tableWrap');
const table = document.getElementById('table');

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

// ponytail: runs in page's MAIN world via chrome.scripting.executeScript, bypasses CSP.
// Does everything at the MIGX store level — no ContentBlocks DOM fiddling.
function addDayWithData(day) {
  var FIELD_MAP = {
    '40': ['day_number'],
    '41': ['en_daytitle', 'web_daytitle', 'sv_daytitle'],
    '42': ['en_accommodation', 'web_accommodation', 'sv_accommodation'],
    '43': ['en_meals', 'web_meals', 'sv_meals'],
    '44': ['en_transportation', 'web_transportation', 'sv_transportation'],
    '45': ['en_duration', 'web_duration', 'sv_duration'],
    '46': ['ascdesc'],
    '47': ['distance'],
    '48': ['coords'],
    '49': ['gallery'],
    '50': ['en_text', 'web_text', 'sv_text'],
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

  grid.addNewItem();

  var s = grid.getStore();
  var idx = s.getCount() - 1;
  var rec = s.getAt(idx);
  var item = rec.json || {};

  var filled = 0;
  for (var df in day) {
    var fields = FIELD_MAP[df];
    if (!fields) continue;
    var val = day[df].value;
    for (var j = 0; j < fields.length; j++) {
      item[fields[j]] = val;
      rec.set(fields[j], val);
    }
    filled++;
  }

  rec.json = item;
  grid.getView().refresh();
  grid.call_collectmigxitems = true;
  grid.collectItems();

  var title = day['41'] ? day['41'].value : (day['40'] ? day['40'].value : '');
  return { ok: true, message: 'Added day "' + title + '" (' + filled + ' fields)' };
}

function setStatus(msg, isError) {
  status.textContent = msg;
  status.className = isError ? 'error' : 'success';
}

async function sendToTab(msg) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return await chrome.tabs.sendMessage(tab.id, msg);
}

function renderTable(days) {
  if (!days || days.length === 0) {
    tableWrap.style.display = 'none';
    return;
  }

  let html = '<thead><tr><th></th>';
  for (const col of COLUMNS) {
    html += `<th>${col.label}</th>`;
  }
  html += '</tr></thead><tbody>';

  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    html += '<tr>';
    html += `<td><button class="addDayBtn" data-index="${i}">Add</button></td>`;
    for (const col of COLUMNS) {
      const val = day[col.field]?.value || '';
      html += `<td title="${escapeAttr(val)}">${escapeHtml(val)}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody>';

  table.innerHTML = html;
  tableWrap.style.display = 'block';
}

function escapeHtml(s) {
  const el = document.createElement('span');
  el.textContent = s;
  return el.innerHTML;
}

function escapeAttr(s) {
  return s.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

table.addEventListener('click', async (e) => {
  const btn = e.target.closest('.addDayBtn');
  if (!btn) return;

  const dayIndex = parseInt(btn.dataset.index);
  btn.disabled = true;
  setStatus(`Adding day ${dayIndex + 1}...`, false);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const { days } = await chrome.storage.local.get(['days']);
    const day = days[dayIndex];

    const [injectionResult] = await chrome.scripting.executeScript({
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
    const res = await sendToTab({ action: 'copy' });
    if (res.ok) {
      setStatus(`Copied ${res.count} days.`, false);
      loadStored();
    } else {
      setStatus(res.error, true);
    }
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
  setStatus('Pasting...', false);
  try {
    const res = await sendToTab({ action: 'paste' });
    if (res.ok) setStatus(res.message || `Pasted ${res.filled} days.`, false);
    else setStatus(res.error, true);
  } catch (e) {
    setStatus(e.message || 'Could not reach page. Reload it and try again.', true);
  }
});

function loadStored() {
  chrome.storage.local.get(['count', 'title', 'days'], (data) => {
    if (data.count) {
      stored.textContent = `Stored: ${data.count} days from "${data.title}"`;
      renderTable(data.days);
    } else {
      stored.textContent = 'No days stored yet.';
      tableWrap.style.display = 'none';
    }
  });
}

loadStored();
