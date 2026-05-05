/**
 * PH Cinema Price Tracker — DECSC 22 Final Project
 *
 * Pulls live movie showtimes + prices from Robinsons Movieworld and Ticket2Me.
 * Computes distance from user's location using Haversine formula.
 * Updates Showtimes sheet on demand (via custom menu).
 *
 * Setup: see ../docs/SETUP.md
 */

// ─── Sheet names ───────────────────────────────────────────────────────────
var SHEET_SETTINGS    = "Settings";
var SHEET_CINEMAS     = "Cinemas";
var SHEET_SHOWTIMES   = "Showtimes";
var SHEET_DASHBOARD   = "Dashboard";
var SHEET_BUDGET      = "Budget";

// ─── Custom menu ───────────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🎬 Cinema Tracker")
    .addItem("Refresh Showtimes (live)", "refreshAllShowtimes")
    .addItem("Refresh Robinsons only", "refreshRobinsons")
    .addItem("Refresh Ticket2Me only", "refreshTicket2Me")
    .addSeparator()
    .addItem("How to use", "showHelp")
    .addToUi();
}

function showHelp() {
  var msg =
    "🎬 PH Cinema Price Tracker\n\n" +
    "1. Open the Settings tab and pick your location + max distance + budget.\n" +
    "2. Click 'Refresh Showtimes' in the 🎬 Cinema Tracker menu above.\n" +
    "3. Open the Dashboard tab to see the cheapest movies near you.\n" +
    "4. Track your spending in the Budget tab.\n\n" +
    "Refresh takes ~1–2 minutes (it queries 41 Robinsons branches + Ticket2Me API).";
  SpreadsheetApp.getUi().alert(msg);
}

// ─── Refresh entry points ──────────────────────────────────────────────────

function refreshAllShowtimes() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rows = [];
  try {
    rows = rows.concat(fetchRobinsons_());
  } catch (e) {
    Logger.log("Robinsons error: " + e);
  }
  try {
    rows = rows.concat(fetchTicket2Me_());
  } catch (e) {
    Logger.log("Ticket2Me error: " + e);
  }
  writeShowtimes_(ss, rows);
  ss.toast("Loaded " + rows.length + " showtimes", "🎬 Done", 5);
}

function refreshRobinsons() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rows = fetchRobinsons_();
  // Append/overwrite Robinsons rows only — keep Ticket2Me data intact
  var existing = readShowtimes_(ss).filter(function(r) { return r[0] !== "Robinsons"; });
  writeShowtimes_(ss, existing.concat(rows));
  ss.toast("Loaded " + rows.length + " Robinsons showtimes", "🎬 Done", 5);
}

function refreshTicket2Me() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rows = fetchTicket2Me_();
  var existing = readShowtimes_(ss).filter(function(r) { return r[0] !== "Ticket2Me"; });
  writeShowtimes_(ss, existing.concat(rows));
  ss.toast("Loaded " + rows.length + " Ticket2Me events", "🎬 Done", 5);
}

// ─── Robinsons fetcher ─────────────────────────────────────────────────────
// Robinsons uses a custom ASP.NET API. The webservice endpoints validate
// User-Agent + Referer + X-Requested-With headers, so we set them all.

var RMW_BASE = "https://robinsonsmovieworld.com";
var RMW_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/147.0.0.0",
  "X-Requested-With": "XMLHttpRequest",
  "Referer": RMW_BASE + "/cinema/bookmovie",
};

function rmwFetch_(path, method) {
  method = method || "POST";
  var res = UrlFetchApp.fetch(RMW_BASE + path, {
    method: method,
    headers: RMW_HEADERS,
    muteHttpExceptions: true,
    followRedirects: true,
  });
  var text = res.getContentText();
  if (res.getResponseCode() >= 400) {
    throw new Error("RMW " + path + " status " + res.getResponseCode());
  }
  // RMW returns double-encoded JSON sometimes
  try {
    var parsed = JSON.parse(text);
    if (typeof parsed === "string") return JSON.parse(parsed);
    return parsed;
  } catch (e) {
    return text;
  }
}

function parseMsDate_(s) {
  if (!s) return null;
  var m = String(s).match(/\/Date\((\d+)/);
  return m ? new Date(parseInt(m[1], 10)) : null;
}

function fmtPhTime_(date) {
  if (!date) return "";
  // Manila is UTC+8, no DST
  var phHour = (date.getUTCHours() + 8) % 24;
  return Utilities.formatString("%02d:%02d", phHour, date.getUTCMinutes());
}

function fmtIsoDate_(date) {
  return Utilities.formatDate(date, "Asia/Manila", "yyyy-MM-dd");
}

function fetchRobinsons_() {
  Logger.log("Fetching Robinsons branches...");
  var branchesRes = rmwFetch_("/webservice/getbranches");
  var branches = (branchesRes && branchesRes.BranchList) || [];
  Logger.log("Got " + branches.length + " branches");

  var rows = [];
  // Loop through each branch — limit to 20 fastest to keep total under Apps Script's 6-min cap
  // Tip: comment out the slice() to get all 41 branches (takes ~2 min)
  var active = branches; // .slice(0, 20);

  for (var i = 0; i < active.length; i++) {
    var b = active[i];
    try {
      // Films at this branch
      var films = rmwFetch_("/webservice/getmovieswithdetailsbybranch?branchKey=" + b.Branch_Key);
      if (!Array.isArray(films)) continue;

      for (var j = 0; j < films.length; j++) {
        var f = films[j];
        // Get screening dates for this film at this branch
        var screenings = rmwFetch_(
          "/webservice/GetScreeningDetailsList?branchKey=" + b.Branch_Key +
          "&movieName=" + encodeURIComponent(f.Movie_Name),
          "GET"
        );
        if (!screenings || !screenings.Data || !screenings.Data.length) continue;

        // First available date only (most relevant)
        var firstDate = screenings.Data[0];
        var dt = parseMsDate_(firstDate.ScreeningDate);
        if (!dt) continue;
        var dateStr = fmtIsoDate_(dt);
        var movieCode = firstDate.MovieCode;

        // Showtimes for that date
        var schedules = rmwFetch_(
          "/webservice/getschedulesbybranchandmovie?movieDate=" + dateStr +
          "&branchId=" + b.Branch_Key + "&movieCode=" + movieCode
        );
        if (!Array.isArray(schedules)) continue;

        for (var k = 0; k < schedules.length; k++) {
          var s = schedules[k];
          var startDt = parseMsDate_(s.Start_Time);
          if (!startDt) continue;
          rows.push([
            "Robinsons",                        // Platform
            String(b.Branch_Key),               // CinemaId
            "Robinsons " + b.Branch_Name + " — " + s.Cinema_Name, // Cinema
            f.Movie_Name,                       // Movie
            dateStr,                            // Date
            fmtPhTime_(startDt),                // Time
            Number(s.Price) || 0,               // Price (PHP)
            "",                                 // Genre
            "",                                 // Venue
            RMW_BASE + "/cinema/branch?branchKey=" + b.Branch_Key, // Link
          ]);
        }
      }
    } catch (e) {
      Logger.log("Branch " + b.Branch_Code + " error: " + e);
    }
  }
  Logger.log("Robinsons total rows: " + rows.length);
  return rows;
}

// ─── Ticket2Me fetcher (theater, music festivals, hundreds of events) ──────

var T2M_AUTH      = "https://kfr7zxlj0a.execute-api.ap-southeast-1.amazonaws.com/prod";
var T2M_EVENT     = "https://2b67fmfmld.execute-api.ap-southeast-1.amazonaws.com/prod";
var T2M_PUBLIC_ORIGIN = "https://ticket2me.net";

function t2mGuestToken_() {
  var res = UrlFetchApp.fetch(T2M_AUTH + "/guest/token", {
    method: "POST",
    contentType: "application/json",
    payload: "{}",
    headers: { "Origin": T2M_PUBLIC_ORIGIN, "Referer": T2M_PUBLIC_ORIGIN + "/" },
    muteHttpExceptions: true,
  });
  var body = JSON.parse(res.getContentText());
  if (!body.data || !body.data.attributes || !body.data.attributes.access_token) {
    throw new Error("Ticket2Me guest token failed");
  }
  return body.data.attributes.access_token;
}

function fetchTicket2Me_() {
  Logger.log("Fetching Ticket2Me front page...");
  var token = t2mGuestToken_();
  var res = UrlFetchApp.fetch(T2M_EVENT + "/events/front-page", {
    method: "GET",
    headers: {
      "Authorization": "Bearer " + token,
      "Origin": T2M_PUBLIC_ORIGIN,
      "Referer": T2M_PUBLIC_ORIGIN + "/",
    },
    muteHttpExceptions: true,
  });
  var body = JSON.parse(res.getContentText());
  if (!body.data) throw new Error("Ticket2Me front-page failed");

  var rows = [];
  var seen = {};

  function pushEvent(e, instance) {
    if (!e || !e.id || seen[e.id]) return;
    seen[e.id] = true;
    var venue = (e.venue_details && e.venue_details.venue_name) || "";
    var city  = (e.venue_details && e.venue_details.location_state) || "";
    var price = e.price != null ? e.price : (instance && instance.price) || 0;
    var dateStr = "", timeStr = "";
    if (instance && instance.start_date) {
      var d = new Date(instance.start_date.replace(" ", "T") + "+08:00");
      dateStr = Utilities.formatDate(d, "Asia/Manila", "yyyy-MM-dd");
      timeStr = Utilities.formatDate(d, "Asia/Manila", "HH:mm");
    }
    rows.push([
      "Ticket2Me",
      "t2m-" + e.id,
      venue + (city ? " (" + city + ")" : ""),
      e.title || "",
      dateStr,
      timeStr,
      Number(price) || 0,
      "",
      venue,
      T2M_PUBLIC_ORIGIN + "/event/" + e.id,
    ]);
  }

  // Coming soon — wrapped in {event_details, start_date, end_date, price}
  var cs = body.data.coming_soon && body.data.coming_soon.attributes;
  if (cs) for (var i = 0; i < cs.length; i++) pushEvent(cs[i].event_details, cs[i]);

  // Featured + Top — bare event objects
  var feat = body.data.featured && body.data.featured.attributes;
  if (feat) for (var i = 0; i < feat.length; i++) pushEvent(feat[i], null);

  var top = body.data.top && body.data.top.attributes;
  if (top) for (var i = 0; i < top.length; i++) pushEvent(top[i], null);

  // Custom rows (themed sections)
  var rows_ = body.data.custom_rows && body.data.custom_rows.attributes;
  if (rows_) {
    for (var i = 0; i < rows_.length; i++) {
      var items = rows_[i].items || [];
      for (var j = 0; j < items.length; j++) pushEvent(items[j].event, null);
    }
  }

  Logger.log("Ticket2Me total rows: " + rows.length);
  return rows;
}

// ─── Showtimes sheet helpers ───────────────────────────────────────────────

var SHOWTIMES_HEADERS = [
  "Platform", "CinemaId", "Cinema", "Movie",
  "Date", "Time", "Price (PHP)", "Genre", "Venue", "Link",
];

function readShowtimes_(ss) {
  var sh = ss.getSheetByName(SHEET_SHOWTIMES);
  if (!sh) return [];
  var n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, SHOWTIMES_HEADERS.length).getValues();
}

function writeShowtimes_(ss, rows) {
  var sh = ss.getSheetByName(SHEET_SHOWTIMES);
  if (!sh) {
    sh = ss.insertSheet(SHEET_SHOWTIMES);
  }
  // Clear and rewrite
  sh.clear();
  sh.getRange(1, 1, 1, SHOWTIMES_HEADERS.length).setValues([SHOWTIMES_HEADERS])
    .setFontWeight("bold").setBackground("#1f4e79").setFontColor("#ffffff");
  if (rows.length > 0) {
    sh.getRange(2, 1, rows.length, SHOWTIMES_HEADERS.length).setValues(rows);
    // Format price column as PHP currency
    sh.getRange(2, 7, rows.length, 1).setNumberFormat("\"₱\"#,##0.00");
  }
  sh.autoResizeColumns(1, SHOWTIMES_HEADERS.length);
  // Last refreshed timestamp in cell L1 (out of the way)
  sh.getRange("L1").setValue("Last refreshed:");
  sh.getRange("M1").setValue(new Date()).setNumberFormat("yyyy-MM-dd HH:mm");
}
