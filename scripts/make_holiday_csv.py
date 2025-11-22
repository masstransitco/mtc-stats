import json
from datetime import datetime, timedelta
from pathlib import Path

SOURCE = Path("public-holidays-hk/en.json")
OUT = Path("public-holidays-hk/holidays.csv")


def period_from_summary(summary: str) -> str:
  s = summary.lower()
  if "lunar new year" in s or "chinese new year" in s:
    return "CNY"
  if "ching ming" in s:
    return "CHING_MING"
  if "good friday" in s or "easter" in s:
    return "EASTER"
  if "labour day" in s:
    return "LABOUR_DAY"
  if "buddha" in s:
    return "BUDDHA"
  if "tuen ng" in s or "dragon boat" in s:
    return "TUEN_NG"
  if "sar establishment" in s:
    return "HKSAR_DAY"
  if "national day" in s:
    return "NATIONAL_DAY"
  if "chung yeung" in s:
    return "CHUNG_YEUNG"
  if "mid-autumn" in s:
    return "MID_AUTUMN"
  if "christmas" in s or "boxing day" in s:
    return "XMAS_NEWYEAR"
  if "the first day of january" in s or "new year" in s:
    return "NEW_YEAR"
  return "HOLIDAY"


def expand_event(evt: dict):
  start_raw = evt["dtstart"][0]
  end_raw = evt["dtend"][0]
  summary = evt.get("summary", "").strip()
  start = datetime.strptime(start_raw, "%Y%m%d").date()
  end = datetime.strptime(end_raw, "%Y%m%d").date()
  period = period_from_summary(summary)
  current = start
  while current < end:
    yield current, summary, period
    current += timedelta(days=1)


def main():
  data = json.loads(SOURCE.read_text())
  events = data["vcalendar"][0]["vevent"]
  rows = []
  for evt in events:
    rows.extend(list(expand_event(evt)))
  rows.sort()
  OUT.write_text("holiday_date,holiday_name,holiday_period\n" + "\n".join(
    f"{d.isoformat()},{name.replace(',', ' ')},{period}"
    for d, name, period in rows
  ))
  print(f"Wrote {len(rows)} holidays to {OUT}")


if __name__ == "__main__":
  main()
