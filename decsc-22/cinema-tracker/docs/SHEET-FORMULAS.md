# Sheet Formulas Cheat-Sheet

Paste these into the Google Sheet exactly as written. They reference the
sheet/tab names defined in `Code.gs` and the cell layout produced by
`build-xlsx.py` (Settings header row 3, Dashboard header row 5, Budget
header row 3 + data starting row 4).

---

## Settings tab

| Cell | Content |
|---|---|
| A1 | `🎬 PH Cinema Price Tracker — Settings` (merged across A1:C1, large title) |
| A3 | `Setting` |
| B3 | `Value` |
| C3 | `Notes` |
| A4 | `Your Location (preset)` |
| B4 | (data validation dropdown — see below; default `Glorietta`) |
| C4 | `Pick from dropdown — drives distance calc` |
| A5 | `Your Latitude` |
| B5 | `=IFERROR(VLOOKUP($B$4, Cinemas!C:G, 4, FALSE), 14.5547)` |
| A6 | `Your Longitude` |
| B6 | `=IFERROR(VLOOKUP($B$4, Cinemas!C:G, 5, FALSE), 121.0244)` |
| A7 | `Max Distance (km)` |
| B7 | `20` |
| A8 | `Max Budget (PHP)` |
| B8 | `450` |
| A9 | `Movie Filter (optional)` |
| B9 | (leave blank — case-insensitive partial match) |

**Data validation for B4 (location preset):**
- Data → Data validation → Dropdown
- Source: `=Cinemas!$C$2:$C$118` (covers all 117 geocoded cinemas; range matches `build-xlsx.py`)
- Or use a smaller curated list: `Glorietta`, `Greenbelt`, `Trinoma`, `SM Megamall`, `SM North Edsa`, `Robinsons Galleria Ortigas`, etc.

---

## Cinemas tab

Import `data/cinemas.csv` into this tab. The CSV header row is:

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| Platform | CinemaId | Name | Address | City | Lat | Lng | GeocodedFrom |

`build-xlsx.py` drops the trailing `GeocodedFrom` column (keeps A–G). After import, **freeze row 1** (View → Freeze → 1 row).

---

## Showtimes tab

Don't touch — the Apps Script writes here. Headers it sets:

| A | B | C | D | E | F | G | H | I | J |
|---|---|---|---|---|---|---|---|---|---|
| Platform | CinemaId | Cinema | Movie | Date | Time | Price (PHP) | Genre | Venue | Link |

Cell L1: `Last refreshed:`
Cell M1: timestamp (auto-set on every refresh).

---

## Dashboard tab — the main view

Title in A1 (merged A1:I1). Subtitle in A3 (merged A3:I3). Headers in row 5. Data spills from A6.

### Header row (row 5)

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| Platform | Cinema | Movie | Date | Time | Price (PHP) | Distance (km) | Link |

### A6 — single FILTER + SORT formula (matches `build-xlsx.py`)

Put this whole formula in **A6** (it spills down automatically):

```
=IFERROR(
SORT(
FILTER(
{Showtimes!A2:A1000, Showtimes!C2:C1000, Showtimes!D2:D1000,
Showtimes!E2:E1000, Showtimes!F2:F1000, Showtimes!G2:G1000,
ARRAYFORMULA(IF(Showtimes!A2:A1000="", "",
6371*2*ASIN(SQRT(
SIN((RADIANS(IFERROR(VLOOKUP(Showtimes!B2:B1000, Cinemas!B:G, 5, FALSE), Settings!$B$5))-RADIANS(Settings!$B$5))/2)^2
+COS(RADIANS(Settings!$B$5))*COS(RADIANS(IFERROR(VLOOKUP(Showtimes!B2:B1000, Cinemas!B:G, 5, FALSE), Settings!$B$5)))
*SIN((RADIANS(IFERROR(VLOOKUP(Showtimes!B2:B1000, Cinemas!B:G, 6, FALSE), Settings!$B$6))-RADIANS(Settings!$B$6))/2)^2
)))),
Showtimes!J2:J1000},
Showtimes!A2:A1000<>"",
Showtimes!G2:G1000>0,
Showtimes!G2:G1000<=Settings!$B$8,
IF(Settings!$B$9="", TRUE,
IFERROR(SEARCH(LOWER(Settings!$B$9), LOWER(Showtimes!D2:D1000))>0, FALSE))
),
6, TRUE, 7, TRUE),
"No showings match your filters yet — refresh data and check your Settings."
)
```

What this does:
1. Combines Showtimes columns A, C, D, E, F, G (Platform, Cinema, Movie, Date, Time, Price)
2. Computes Haversine distance using Settings B5/B6 (your lat/lng) and Cinemas F/G (cinema lat/lng) — VLOOKUPed by CinemaId from Showtimes!B
3. Adds the Link column
4. Filters: not-empty AND price > 0 AND price ≤ Max Budget (B8) AND (Movie Filter blank OR substring match against B9)
5. Sorts by price ASC (col 6), then distance ASC (col 7)
6. Falls back to a friendly message if no rows match (IFERROR wrapping SORT)

> Note: `build-xlsx.py` wraps the whole thing in `IFERROR(...)` and skips a hard distance cap so the user can keep distance soft. If you want a hard distance cap, add `Showtimes!G2:G1000<=Settings!$B$7` (Max Distance) as another FILTER predicate against the helper distance column — but you'll need to materialize the distance column on Showtimes first.

### Conditional formatting

Already applied by `build-xlsx.py`. If you build manually:
- F6:F1000 — Price < 350 → green
- G6:G1000 — Distance 10–20 km → orange; > 20 km → red

---

## Budget tab

Title in A1 (merged A1:G1). Headers in row 3. Data starts row 4.

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| Date | Movie | Cinema | Tickets | Price per Ticket (PHP) | Total (PHP) | Notes |

### Auto-fill Total (column F)

`build-xlsx.py` pre-fills rows 4–100 with:
```
=IF(A4="", "", D4*E4)
```
(Same shape in every row — copy down if you extend past row 100.)

### Summary block (column H label + column I value, starting row 5)

The summary header sits at I3 (`Summary`). The 6 rows below run from row 5 to row 10:

| Cell (label) | Cell (value) | Formula | Description |
|---|---|---|---|
| H5 | I5 | `=SUM(F4:F1000)` | Total spent YTD |
| H6 | I6 | `=SUM(D4:D1000)` | Tickets bought |
| H7 | I7 | `=IFERROR(I5/I6, 0)` | Avg price / ticket |
| H8 | I8 | `=IFERROR(INDEX(C4:C1000, MATCH(MAX(COUNTIF(C4:C1000, C4:C1000)), COUNTIF(C4:C1000, C4:C1000), 0)), "-")` | Most-visited cinema |
| H9 | I9 | `=SUMIFS(F:F, A:A, ">="&EOMONTH(TODAY(),-1)+1, A:A, "<="&EOMONTH(TODAY(),0))` | This month spent |
| H10 | I10 | `=COUNTIFS(A4:A1000, ">="&DATE(YEAR(TODAY()),1,1), A4:A1000, "<="&DATE(YEAR(TODAY()),12,31))` | Movies this year |

Number formats applied by `build-xlsx.py`: I5/I7/I9 → `"₱"#,##0.00`; I6/I10 → `0`.

### Charts

- Pie chart of spend by Cinema (anchored at I12 by `build-xlsx.py`; data Reference F3:F20 with categories C4:C20)
- (Optional) Column chart of spend by month — add a helper column with `=TEXT(A4, "yyyy-MM")` and chart against F.

---

## Tips

- **Lock formula cells**: Data → Protect range → uncheck "Allow editing" → only let users edit Settings B4, B7, B8, B9 + Budget rows A4:G100.
- **Hide the Showtimes tab** from end users (right-click tab → Hide). Dashboard reads from it but users don't need to see raw data.
- **Refresh trigger**: optionally add a time-driven trigger that runs `refreshAllShowtimes` daily at 6am (Apps Script editor → Triggers → Add Trigger).
