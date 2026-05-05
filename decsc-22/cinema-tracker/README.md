# PH Cinema Price Tracker

DECSC 22 Final Project · Practical Google Sheets application

## What it is

A Google Sheets-based tool that pulls live movie showtimes and prices from
multiple Philippine cinema chains, computes the distance from the user's
location, and surfaces the cheapest options on a Dashboard. Includes a
budget-tracker for logging movies watched.

## Why Google Sheets (not Excel)

The course brief allows Apps Script for the project. Apps Script lets us
fetch live JSON over HTTP, which is what makes the tracker dynamic instead
of a frozen snapshot. Pure Excel would limit us to manual CSV imports.

## Folder layout

```
cinema-tracker/
├── README.md                        # this file
├── USER-MANUAL.md                   # the deliverable user manual
├── build-xlsx.py                    # builds cinema-tracker.xlsx (drop into Drive → auto-converts to Sheets)
├── cinema-tracker.xlsx              # generated workbook with all 5 tabs + formulas + dropdowns + charts
├── apps-script/
│   └── Code.gs                      # paste into Extensions → Apps Script (after Drive upload)
├── docs/
│   ├── SETUP.md                     # one-time setup walkthrough
│   └── SHEET-FORMULAS.md            # cell-by-cell formulas reference
└── data/
    ├── cinema-coordinates.json      # 117 geocoded cinemas (raw, with metadata)
    ├── cinemas.csv                  # paste into Cinemas tab
    ├── settings.csv                 # template for Settings tab
    └── budget-template.csv          # template for Budget tab
```

## Tech summary

| Component | Tech |
|---|---|
| Spreadsheet | Google Sheets |
| Live data fetch | Google Apps Script (`UrlFetchApp.fetch`) |
| Cinema chains / event sources supported | Robinsons Movieworld (41 branches, of which 39 geocoded), Ticket2Me (~2,639 live events) |
| Distance calculation | Haversine formula in spreadsheet (`ARRAYFORMULA`) |
| Geocoding (one-time, pre-computed) | OpenStreetMap Nominatim — free, no key |
| Filtering / sorting | Google Sheets `QUERY` function |

## Course requirements ✓

| Requirement | Where |
|---|---|
| Excel application | The Google Sheet itself (Apps Script allowed per brief) |
| Practical, dynamic, updates with edits | Settings → Dashboard recalculates live |
| Idiot-proof for non-Excel users | Single button refresh; protected formulas; dropdowns; clear labels |
| User Manual | [`USER-MANUAL.md`](./USER-MANUAL.md) |
| Video Tutorial | (record after building — 3-5 min screencast) |

## Setup (15 min)

See [`docs/SETUP.md`](./docs/SETUP.md) for the step-by-step walkthrough.

Short version (drag-and-drop method, recommended):
1. Run `python3 build-xlsx.py` (or use the prebuilt `cinema-tracker.xlsx`).
2. Drag `cinema-tracker.xlsx` into Google Drive — Drive auto-converts it to a Google Sheet, preserving all 5 tabs (`Settings`, `Dashboard`, `Showtimes`, `Budget`, `Cinemas` — in that order), formulas, dropdowns, conditional formatting, and the pie chart.
3. Open the converted sheet → Extensions → Apps Script → paste `apps-script/Code.gs` → save → reload the sheet.
4. Click 🎬 Cinema Tracker → Refresh Showtimes (live).

## Limitations

- **SM Cinema and SureSeats / Ayala** can't be queried from Apps Script — their
  Cloudflare wall blocks Google's IP range. Only Robinsons + Ticket2Me work.
  (The parent `easyticket` repo has a Patchright-based approach for those, but
  that needs a real browser, which Apps Script doesn't provide.)
- Apps Script has a 6-minute execution limit. Refreshing all 41 Robinsons
  branches uses ~2 min, so we're well under, but adding more sources may push
  it. Already mitigated via per-platform menu items (`Refresh Robinsons only`,
  `Refresh Ticket2Me only`) in `apps-script/Code.gs`.
- Distance is "as the crow flies" via Haversine — not driving distance. Good
  enough for "is this cinema reachable" filtering, not for ETA.

## Credit

Cinema coordinates: OpenStreetMap contributors via Nominatim.
Cinema data: scraped per-platform from public APIs (no auth required for read-only).
