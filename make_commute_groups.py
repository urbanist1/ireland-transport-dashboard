"""Turn a CSO table F7122 export into data/commute_groups.csv.

F7122: persons usually resident and present in the State, travelling to work,
school or college, by means of travel, group (workers, children, students),
sex and census year (1986-2022).

Usage:
    python make_commute_groups.py F7122.csv
    python build_data.py

Download the CSV from data.cso.ie (table F7122, all means of travel, all groups).
Only the "Both sexes" rows are kept; "All persons" and "All means of travel"
are dropped because the page adds them up itself.
"""
import csv
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "data" / "commute_groups.csv"

GROUPS = {
    "Population aged 15 years and over at work": "Workers (15+)",
    "Children at school or childcare aged between 0 and 4 years": "Childcare (0-4)",
    "Children at school aged between 5 and 12 years": "Primary school (5-12)",
    "Students at school or college aged between 13 and 18 years": "Secondary (13-18)",
    "Students at school or college aged 19 years and over": "Students (19+)",
}
MODES = {
    "On foot": "Walking",
    "Bicycle": "Cycling",
    "Bus, minibus or coach": "Bus",
    "Train, DART or LUAS": "Rail",
    "Motor car: Driver": "Car driver",
    "Motor car: Passenger": "Car passenger",
    "Motorcycle or scooter": "Motorcycle",
    "Other means (incl. lorry or van)": "Van, lorry or other",
    "Not stated": "Not stated",
}


def main(src: str) -> None:
    rows = []
    with open(src, encoding="utf-8-sig", newline="") as f:  # CSO files start with a byte-order mark
        for r in csv.DictReader(f):
            if r["Sex"] != "Both sexes":
                continue
            group = GROUPS.get(r["At Work, Childcare, School or College"])
            mode = MODES.get(r["Means of Travel"])
            if group and mode:
                rows.append({"year": int(r["CensusYear"]), "group": group, "mode": mode, "value": int(r["VALUE"])})
    if not rows:
        sys.exit("No matching rows: is this the F7122 table?")
    rows.sort(key=lambda r: (r["year"], list(GROUPS.values()).index(r["group"]), list(MODES.values()).index(r["mode"])))
    with open(OUT, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["year", "group", "mode", "value"])
        w.writeheader()
        w.writerows(rows)
    print(f"{OUT.relative_to(HERE)}: {len(rows)} rows, {rows[0]['year']}-{rows[-1]['year']}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
