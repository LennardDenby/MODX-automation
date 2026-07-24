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
    .replace(/\bminutter\b/gi, 'min')
    .replace(/\bmin\b/gi, 'min')
    .replace(/\bog\b/gi, 'and');
}

function getApiKey() {
  var k = (window.GEMINI_API_KEY || '').trim();
  if (k) return k;
  return null;
}

async function translateTexts(texts, apiKey) {
  var prompt = 'Translate these Norwegian words/phrases to American English. Return ONLY a JSON array of translations, in the exact same order. Each element must be a string. Do not include any other text, explanation, or markdown.\n';
  prompt += 'When text includes "xxxx moh", translate into this format: "xxxx m", do not convert to feet, and avoid comma or space between numbers. Example: (2460 moh) → (2460 m).\n';
  prompt += 'Do not use "tour", use "trip" instead.\n';
  prompt += 'For currency use ISO 4217 codes after the number.\n\n';
  prompt += 'Phrases:\n' + JSON.stringify(texts.map(function (t) { return t.text; }));

  var resp = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=' + apiKey,
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

  if (!data.candidates || !data.candidates.length) {
    var reason = (data.promptFeedback && data.promptFeedback.blockReason) || 'empty response';
    throw new Error('Gemini returned no results (' + reason + '). Norwegian stored only.');
  }

  var raw = (data.candidates[0].content.parts[0].text || '').trim();
  raw = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  return JSON.parse(raw);
}

async function translateDays(days, apiKey) {
  var CHUNK = 10;
  for (var offset = 0; offset < days.length; offset += CHUNK) {
    var slice = days.slice(offset, offset + CHUNK);
    var texts = [];
    for (var d = 0; d < slice.length; d++) {
      var day = slice[d];
      for (var f = 0; f < TRANSLATE_FIELDS.length; f++) {
        var field = TRANSLATE_FIELDS[f];
        var entry = day[field];
        if (entry && entry.value && entry.value.trim()) {
          texts.push({ dayIndex: offset + d, field: field, text: entry.value.trim() });
        }
      }
    }

    if (texts.length === 0) continue;

    var translations = await translateTexts(texts, apiKey);

    for (var i = 0; i < Math.min(translations.length, texts.length); i++) {
      var t = texts[i];
      var translation = translations[i];
      if (translation && typeof translation === 'string') {
        days[t.dayIndex][t.field].en = translation;
      }
    }
  }
}
