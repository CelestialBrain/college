# Setup Guide — PH Cinema Price Tracker

One-time setup, ~15 minutes.

## What you need

- A Google account
- Internet connection (for live data refresh)

## Recommended path: drag-and-drop the prebuilt xlsx

The fastest setup is to skip steps 1–4 below and just upload the prebuilt workbook:

1. From the repo root, run `python3 build-xlsx.py` (or use the committed `cinema-tracker.xlsx`).
2. Go to **drive.google.com**, drag `cinema-tracker.xlsx` in, then double-click → **Open with Google Sheets**.
3. From the menu: **File → Save as Google Sheets**. Drive auto-converts every tab, formula, dropdown, conditional formatting rule, and the budget pie chart.
4. Skip to **Step 5** (Apps Script).

The manual path below is the fallback if the conversion ever drops a formula.

---

## Step 1 — Create the Google Sheet (manual path)

1. Go to **sheets.google.com** → click "+ Blank"
2. Rename it: `PH Cinema Price Tracker — DECSC 22 Final`

## Step 2 — Create 5 tabs (in this order)

Right-click the bottom tab → "Duplicate" or "+" to add new sheets. Name them exactly, in this order (matches `cinema-tracker.xlsx`):

1. `Settings`
2. `Dashboard`
3. `Showtimes`
4. `Budget`
5. `Cinemas`

## Step 3 — Import static data

### Cinemas tab
1. Open the `Cinemas` tab
2. **File → Import → Upload** → select `data/cinemas.csv`
3. Choose: **Replace current sheet**, separator: **Comma**
4. Header row (Platform, CinemaId, Name, …) appears as row 1
5. **View → Freeze → 1 row**

### Settings tab
Manually type rows from `data/settings.csv`, OR import the CSV the same way.

### Budget tab
1. Open the `Budget` tab
2. **File → Import → Upload** → select `data/budget-template.csv`
3. Choose: **Replace current sheet**, separator: **Comma**
4. (Delete the 3 sample rows or keep as examples)

## Step 4 — Add formulas

Open `docs/SHEET-FORMULAS.md` and follow it tab-by-tab. Key cells (matching `build-xlsx.py`):

**Settings B5 + B6** (your lat/lng — auto-fills from the preset in B4):
```
B5: =IFERROR(VLOOKUP($B$4, Cinemas!C:G, 4, FALSE), 14.5547)
B6: =IFERROR(VLOOKUP($B$4, Cinemas!C:G, 5, FALSE), 121.0244)
```

**Settings B4** (data validation dropdown — location preset):
- Click B4 → Data → Data validation → Dropdown
- Source: cinema names from `Cinemas!C2:C200` (or the exact range in `build-xlsx.py`)

**Dashboard A6** (the master FILTER + SORT formula — header row sits at row 5):
- Copy from `docs/SHEET-FORMULAS.md` exactly. It's long but goes in one cell and spills down.

**Budget F4** (auto-total — pre-filled in rows 4–100 by `build-xlsx.py`):
```
=IF(A4="", "", D4*E4)
```

## Step 5 — Add the Apps Script

1. **Extensions → Apps Script** (opens a new tab)
2. Delete the default `function myFunction() { }` placeholder
3. Open `apps-script/Code.gs` from this repo
4. Copy its entire contents
5. Paste into the Apps Script editor (replacing everything)
6. Click the 💾 save icon → name the project `Cinema Tracker`
7. Close the Apps Script tab

## Step 6 — Authorize the script

1. Go back to your Google Sheet
2. **Reload the page** (the menu only appears after reload)
3. You'll see a new menu: **🎬 Cinema Tracker**
4. Click **🎬 Cinema Tracker → Refresh Showtimes (live)**
5. First time: Google will ask for permission to make external HTTP calls
   - Click "Continue"
   - Pick your Google account
   - "Advanced" → "Go to Cinema Tracker (unsafe)" — this is normal for personal scripts
   - Click "Allow"
6. The script runs (~1-2 minutes) and fills the Showtimes tab

## Step 7 — Test

1. Open the **Settings** tab
2. Pick a location from the **B4** dropdown (e.g. `Glorietta`) — B5/B6 should auto-fill
3. Set **B7 (Max Distance)**: `15`, **B8 (Max Budget)**: `400`
4. Open the **Dashboard** tab — row 5 has headers, row 6 onward should list the cheapest movies near Glorietta within 15km / under ₱400
5. Type `michael` into **B9 (Movie Filter)** → Dashboard list filters live

## Step 8 — Polish (idiot-proofing)

- Hide the Showtimes tab (right-click → Hide). Users don't need to see raw data.
- Protect formula cells: Data → Protect range → only let users edit Settings B4, B7, B8, B9 + Budget data rows (A4:G100).
- Conditional formatting on Dashboard (already set in `build-xlsx.py`, re-add if you built manually):
  - Price (column F) < ₱350 → green
  - Distance (column G) 10–20km → orange; > 20km → red

## Troubleshooting

**"Refresh Showtimes" times out:**
- Apps Script has a 6-minute execution limit. Robinsons alone takes ~2 min.
- If it hits the limit, split into 2 calls: refresh Robinsons separately from Ticket2Me.

**No data appears on Dashboard:**
- Check Settings: max budget probably too low, or movie filter has a typo
- Check Showtimes tab — does it have rows?

**SM Cinema / SureSeats data is missing:**
- These platforms use Cloudflare which blocks Apps Script's IP. Only Robinsons + Ticket2Me work from sheets.
- The local repo has live SM Cinema data via Patchright bootstrap, but that needs a browser — outside Apps Script's capabilities.

**Apps Script asks to authorize again:**
- Normal — happens once per Google account when you grant new scopes.
