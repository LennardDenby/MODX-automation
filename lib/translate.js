var TRANSLATE_FIELDS = ['41', '50', '42', '44'];

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
