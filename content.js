function readInputValue(el) {
  if (el.tagName === 'TEXTAREA') return el.value;
  if (el.type === 'hidden') return el.value;
  return el.value || '';
}

function writeInputValue(el, value) {
  const prev = el.value;
  el.value = value;
  if (el.value !== prev || value !== prev) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function scrapeDays() {
  const rows = document.querySelectorAll('.contentblocks-repeater-row');
  const days = [];

  for (const row of rows) {
    const fields = row.querySelectorAll('li[data-field]');
    if (fields.length === 0) continue;

    const day = {};
    for (const field of fields) {
      const dataField = field.getAttribute('data-field');
      const label = field.querySelector('label')?.textContent?.trim() || '';
      const input = field.querySelector('input, textarea');
      if (!input) continue;

      const value = readInputValue(input);
      if (!value) continue;

      day[dataField] = { label, value };
    }

    if (Object.keys(day).length > 0) days.push(day);
  }

  return days;
}

function fillDays(days) {
  const rows = document.querySelectorAll('.contentblocks-repeater-row');
  const result = { filled: 0, skipped: 0, targetRows: rows.length };

  for (let i = 0; i < Math.min(days.length, rows.length); i++) {
    const row = rows[i];
    const day = days[i];
    fillSingleRow(row, day);
    result.filled++;
  }

  if (days.length > rows.length) {
    result.skipped = days.length - rows.length;
  }

  return result;
}

function fillSingleRow(row, day) {
  const fields = row.querySelectorAll('li[data-field]');
  for (const field of fields) {
    const dataField = field.getAttribute('data-field');
    const entry = day[dataField];
    if (!entry) continue;

    const label = field.querySelector('label')?.textContent?.trim() || '';
    if (label !== entry.label) continue;

    const input = field.querySelector('input, textarea');
    if (!input) continue;

    writeInputValue(input, entry.value);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function pollAndFill(day) {
  const currentRows = document.querySelectorAll('.contentblocks-repeater-row').length;
  let attempts = 0;

  return new Promise((resolve) => {
    function check() {
      attempts++;
      const rows = document.querySelectorAll('.contentblocks-repeater-row');
      if (rows.length > currentRows) {
        const newRow = rows[rows.length - 1];
        fillSingleRow(newRow, day);
        var title = day['41']?.value || day['40']?.value || '';
        resolve({ ok: true, message: 'Added day "' + title + '"' });
        return;
      }
      if (attempts >= 30) {
        resolve({ ok: false, error: 'Timed out waiting for new row to appear. Try again.' });
        return;
      }
      setTimeout(check, 300);
    }
    check();
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'copy') {
    const days = scrapeDays();
    chrome.storage.local.set({ days, count: days.length, url: location.href, title: document.title }, () => {
      sendResponse({ ok: true, count: days.length });
    });
    return true;
  }

  if (msg.action === 'paste') {
    chrome.storage.local.get(['days', 'count'], (data) => {
      if (!data.days || data.days.length === 0) {
        sendResponse({ ok: false, error: 'No days copied yet. Copy from source page first.' });
        return;
      }
      const result = fillDays(data.days);
      sendResponse({
        ok: true,
        ...result,
        total: data.count,
        message: `Pasted ${result.filled} days.${result.skipped ? ` ${result.skipped} days skipped (not enough target rows).` : ''}`
      });
    });
    return true;
  }

  if (msg.action === 'fillAddedDay') {
    pollAndFill(msg.day).then(sendResponse);
    return true;
  }
});
