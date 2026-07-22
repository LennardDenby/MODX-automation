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
    const res = await sendToTab({ action: 'addDay', dayIndex });
    if (res.ok) setStatus(res.message, false);
    else setStatus(res.error, true);
  } catch (e) {
    setStatus(e.message || 'Could not reach page. Reload it and try again.', true);
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
