## Setup
1. Go to `chrome://extensions` → enable "Developer mode"
2. "Load unpacked" → select this folder
3. Set Gemini API key in `lib/api-key.js`:
   ```
   window.GEMINI_API_KEY = 'your-key';
   ```

## Usage
1. Open the **Document page** → click extension icon → **Copy Days from This Page**
2. Open the **Template Variables** (new template) → click icon → **Paste ALL Days Into This Page**

Each stored day also has an **Add** button to insert one day at a time.

Norwegian text is auto-translated to English via Gemini. Meals and duration are mapped directly.
