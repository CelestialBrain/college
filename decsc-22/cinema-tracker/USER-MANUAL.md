# PH Cinema Price Tracker — User Manual

DECSC 22 Final Project · Spring 2026

---

## What it does

Find the cheapest movie showing near you, across multiple Philippine cinema
chains, in real time. Track your movie spending. Stay under budget.

## What you'll see when you open the sheet

Five tabs along the bottom (in this order):

| Tab | Purpose | Edit it? |
|---|---|---|
| **Settings** | Tell the tracker where you are + your budget | ✅ Yes |
| **Dashboard** | Filtered + sorted results — the main view | ❌ No (auto-calculated) |
| **Showtimes** | Live data fetched from cinema websites | ❌ No (auto-filled) |
| **Budget** | Log every movie ticket you buy | ✅ Yes |
| **Cinemas** | Reference data — 117 geocoded cinema branches | ❌ No |

---

## How to use it

### 1. Set your location and budget

Open the **Settings** tab. The header sits in row 3; editable cells are highlighted yellow.

| Cell | What to do |
|---|---|
| **B4 (Your Location preset)** | Click → dropdown appears → pick the cinema closest to you (or your usual spot). B5 + B6 (Lat / Lng) auto-fill from this. |
| **B7 (Max Distance km)** | Type a number — only show cinemas within this radius |
| **B8 (Max Budget PHP)** | Type a number — hide showtimes above this price |
| **B9 (Movie Filter)** | Type a movie name to filter (or leave blank for all) |

> **Tip:** Set max distance to 10 km if you live near major malls; 30 km if you'll travel.

### 2. Refresh live data

At the top of the sheet, look for the **🎬 Cinema Tracker** menu (next to File, Edit, View…). It has four items:

- **Refresh Showtimes (live)** — runs both fetchers (Robinsons + Ticket2Me)
- **Refresh Robinsons only** — keeps Ticket2Me rows intact, refreshes the 41 Robinsons branches only
- **Refresh Ticket2Me only** — keeps Robinsons rows intact, refreshes Ticket2Me only
- **How to use** — pops up a quick reminder

Click **Refresh Showtimes (live)** the first time. Wait ~2 minutes. You'll see a green toast: "Loaded N showtimes".

> **Tip:** The first time you click it, Google will ask permission to fetch data from external sites. Click Allow. Only needs to be done once per account.

### 3. View results

Open the **Dashboard** tab.

You'll see a list of movies sorted by **price (cheapest first)**, then by distance. Each row shows:

- Platform (Robinsons or Ticket2Me — SM Cinema / Ayala All Access are not fetched from Apps Script; see Limitations in `README.md`)
- Cinema name
- Movie
- Date and time
- Price in PHP
- Distance from your location in km
- Direct link to buy

**Color coding:**
- 🟢 Green = under ₱350
- 🟠 Orange = more than 10km away
- 🔴 Red = more than 20km away

### 4. Track your spending

Open the **Budget** tab and add a row every time you watch a movie. Headers are in row 3; data starts in row 4 (3 sample rows are pre-filled — feel free to delete them).

| Date | Movie | Cinema | Tickets | Price per Ticket | Notes |
|---|---|---|---|---|---|
| 2026-05-15 | Lee Cronin's The Mummy | Robinsons Manila | 2 | 330 | Friday date night |

The **Total** column (F) auto-calculates from `Tickets × Price per Ticket`. The summary block on the right side (labels in column H, values in column I, starting at row 5) auto-updates:
- Total spent YTD
- Tickets bought
- Avg price / ticket
- Most-visited cinema
- This month spent
- Movies this year

A pie chart of spend-by-cinema sits below the summary block.

---

## Common questions

**Q: How fresh is the data?**
A: As fresh as your last "Refresh Showtimes" click. Recommended: refresh once a day or before going to a movie.

**Q: Can I see SM Cinema and Ayala All Access prices?**
A: Their websites block automated fetches (Cloudflare). Robinsons + Ticket2Me work fine. The Dashboard pulls from those two.

**Q: The list is empty / wrong:**
A: Check **Settings**. If you set Max Distance too low (e.g. 1 km), nothing fits. Try 30 km. Also check that Max Budget isn't crazy low.

**Q: Distance is wrong:**
A: The location preset uses each cinema's coordinates as your "home". To use your actual home, type your latitude/longitude directly into B5 (Lat) and B6 (Lng), overwriting the auto-VLOOKUP formulas. (Look up your coordinates on Google Maps → right-click your house → first row of the menu has lat,lng.)

**Q: I broke a formula:**
A: Press Ctrl/Cmd + Z to undo. Or copy the formula again from `docs/SHEET-FORMULAS.md`.

**Q: Refresh times out:**
A: Apps Script has a 6-minute execution limit. Try refreshing Robinsons only, then Ticket2Me only (separate menu items).

---

## What you should NOT touch

These are auto-managed by the script:
- **Showtimes tab** — overwritten on every refresh
- **Dashboard formulas** — they calculate from Showtimes + Settings
- The whole **Cinemas tab** — reference data only

If you accidentally delete a formula, paste it back from `docs/SHEET-FORMULAS.md`.

---

## Behind the scenes (for the curious)

When you click "Refresh Showtimes", the Apps Script:

1. Calls `https://robinsonsmovieworld.com/webservice/getbranches` → 41 branches
2. For each branch, calls `getmovieswithdetailsbybranch` → list of films
3. For each film, calls `GetScreeningDetailsList` → showtimes
4. Pulls Ticket2Me front-page via AWS API Gateway with a guest JWT
5. Writes everything to the Showtimes tab

Distance is calculated using the **Haversine formula** (great-circle distance on a sphere — accurate to ~0.5% for the PH).

The Cinemas tab's coordinates were pre-geocoded using OpenStreetMap Nominatim (free, no API key needed).

---

*Built for DECSC 22 — Excel/Sheets practical application project.*
*Last updated: 2026-05-05*
