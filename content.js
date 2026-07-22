function readInputValue(el) {
  if (el.tagName === 'TEXTAREA') return el.value;
  if (el.type === 'hidden') return el.value;
  return el.value || '';
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

    // ponytail: skip empty placeholder days
    var dayNum = day['40'];
    if (!dayNum || !dayNum.value || !/^\d+$/.test(String(dayNum.value).trim())) continue;

    if (Object.keys(day).length > 0) days.push(day);
  }

  return days;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'copy') {
    const days = scrapeDays();
    chrome.storage.local.set({ days, count: days.length, url: location.href, title: document.title }, () => {
      sendResponse({ ok: true, count: days.length });
    });
    return true;
  }
});
