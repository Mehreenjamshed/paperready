# PaperReady – launch guide

This folder is the complete PaperReady web app. It works on phones like an app, and it can go to the Google Play Store through PWABuilder, with no Android Studio needed.

## What's already done

- **App:** onboarding, Home (exam countdown, streak, Revise today, study tasks), Plan (chapters with spaced revision on day 1, 3, 7, 14 and 30), focus timer, Prep (topic quiz, PDF quiz, Mistake Book), quiz in Practice, Timed exam or Flashcards mode, Results, and Progress with settings.
- **Backend:** Supabase project **PaperReady** (region Singapore) with the `generate-quiz` function deployed. `config.js` is already connected to it.
- **Data:** each student's plan is saved on their own phone.

## Step 1: Add your AI key (5 minutes)

The backend works with **Google Gemini** or **OpenAI**. Use Gemini's free tier for testing, then switch to OpenAI (or paid Gemini) when students arrive.

**Gemini (free for testing):**
1. Go to **aistudio.google.com** → **Get API key** → **Create API key**. Copy it.
2. In supabase.com → project **PaperReady** → **Edge Functions** → **Secrets**, add `GEMINI_API_KEY` with your key. Save.
3. That's it. When a Gemini key is present, the app uses Gemini automatically.

**Switching to OpenAI later:**
1. Add credit at platform.openai.com → Settings → Billing, and set a monthly usage limit.
2. In Supabase Secrets, add `AI_PROVIDER` = `openai` (the `OPENAI_API_KEY` secret is already there).

**Optional secrets:**
- `GEMINI_MODEL` / `OPENAI_MODEL`: use a newer model name (defaults: `gemini-3.5-flash-lite`, with `gemini-flash-latest` as backup; `gpt-4o-mini`).
- `VERIFY_ANSWERS`: `true` or `false`. A second AI call checks every answer. It's on for OpenAI and off for Gemini by default, to save the free quota.

Never put an AI key in `config.js` or anywhere in the app files.

## Step 2: Put the app online (10 minutes)

The easiest option is Netlify Drop:

1. Go to app.netlify.com/drop and sign up for free.
2. Drag this whole **paperready-app** folder onto the page.
3. Netlify gives you a link like `https://something.netlify.app`. Open it on your phone and test it.
4. In Netlify → Domain settings, you can rename it (e.g. `paperready.netlify.app`) or connect **paperready.pk** after you buy it.

Vercel or Cloudflare Pages also work. Upload the same folder.

## Step 3: Make the Play Store app (20 minutes)

1. Go to **pwabuilder.com** and paste your app's link. Click **Start**.
2. Click **Package for stores** → **Android** → **Generate**.
   - Package ID: e.g. `pk.paperready.app` (you can't change this later)
   - App name: PaperReady
3. Download the zip. Inside are:
   - an **.aab** file → upload this in Play Console
   - **assetlinks.json** → put it in this app folder at `.well-known/assetlinks.json`, then re-upload the folder to Netlify. This removes the browser bar from the app.
   - a **signing key**: keep it safe, you need it for every update.
4. In Play Console: Create app → upload the .aab under **Testing → Closed testing** first. New personal accounts need 12+ testers for 14 days before going to Production.

## Updating the app later

Change the files and drag the folder to Netlify again. The Play Store app updates automatically because it loads your website. You only need a new .aab when you change the app name, icon or package settings.

When you change files, also change `paperready-v1` to `paperready-v2` (and so on) at the top of `sw.js`, so phones download the new version.

## Not in this first version yet

- **Phone-time study nudge:** web apps can't see other apps' screen time. This needs a native Android feature added later.
- **Accounts and sync across phones:** data stays on one phone for now. Supabase login can be added next.
- **Premium payments ($2/month):** the Premium screen is ready, but the button stays off until Google Play billing is connected after launch (set `PAYMENTS_LIVE: true` in `config.js` then). The 5-free-quizzes-a-day limit is checked inside the app only for now.
- **Scanned PDFs (photos of pages):** only text PDFs work for now.

## Files

| File | What it is |
| --- | --- |
| index.html | App page |
| app.js | All app logic |
| styles.css | Notebook design |
| config.js | Backend link, free limits (5 quizzes/day) and Premium price |
| manifest.webmanifest | App name, icon and colours for install |
| sw.js | Offline support |
| icons/ | App icons (192, 512, maskable) |
| backend/generate-quiz/index.ts | Copy of the Supabase quiz function |
