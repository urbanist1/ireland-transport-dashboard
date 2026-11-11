"""Turn the CSO Census 2022 ED-to-ED commuting flows into data/galway_flows.json
(the "Commuting flows" tab).

Inputs, all from the CSO:
  * Commuting_Data_EDtoED_2022.csv - Place of Work, School or College (POWSCC)
    flows between Electoral Divisions (EDs)
  * CSO_Electoral_Divisions_National_Statistical_Boundaries_2022_Ungeneralised*.geojson
    - ED boundaries; each ED also carries its Local Electoral Area (CSO_LEA)
  * SAPS_2022_ED.csv (optional) - Small Area Population Statistics by ED, for
    population figures

Usage:
    pip install geopandas
    python make_galway_flows.py FLOWS.csv EDS.geojson [SAPS.csv]
    python build_data.py

To build another county, set --counties to its COUNTY_ENGLISH values in the
ED boundary file and --name to what the page should call it, e.g.
    python make_galway_flows.py FLOWS.csv EDS.geojson SAPS.csv --counties "CORK,CORK CITY" --name Cork
(the output is still written to data/galway_flows.json, which the tab reads).

What goes in the file:
  * every ED in the chosen counties, with its electoral area, population and
    centre point, and simplified boundaries for EDs and electoral areas
  * every flow between those EDs (including people staying in their own ED)
  * for each ED, people going elsewhere (other counties grouped, Northern
    Ireland, overseas, working from home, no fixed place) and people coming in
    from elsewhere, by county
"""
import argparse
import csv
import json
import math
import pathlib
from collections import defaultdict

import geopandas as gpd
from shapely.geometry import MultiPolygon, mapping
from shapely.geometry.polygon import orient

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "data" / "galway_flows.json"

ED_TOLERANCE_M = 50     # boundary simplification, metres (Irish Transverse Mercator)
AREA_TOLERANCE_M = 120
MIN_ISLAND_M2 = 50_000  # drop islets smaller than 5 ha (an ED's largest part is always kept)
DUBLIN = {"Dublin City", "Dún-Laoghaire Rathdown", "South Dublin", "Fingal"}
NORTHERN_IRELAND = {"Mid Ulster", "Causeway Coast and Glens", "Armagh, Banbridge and Craigavon",
                    "Fermanagh and Omagh", "Newry, Mourne and Down", "Belfast", "Derry and Strabane",
                    "Antrim and Newtownabbey", "Ards and North Down", "Lisburn and Castlereagh",
                    "Mid and East Antrim"}


def bucket(county: str, label: str) -> str:
    """Group a destination or origin outside the chosen counties."""
    if label == "Work/school from home":
        return "WFH"
    if label == "No fixed place of work":
        return "NFP"
    if county in DUBLIN:
        return "Dublin"
    if county in ("Cork City", "Cork County"):
        return "Cork"
    if county == "Overseas" or label == "Overseas":
        return "Overseas"
    if county == "Northern Ireland" or label in NORTHERN_IRELAND:
        return "Northern Ireland"
    return county.replace(" City and County", "").replace(" County", "")


def drop_islets(geom):
    """Remove tiny islands from a (multi)polygon in metres, keeping its largest part."""
    if geom.geom_type != "MultiPolygon":
        return geom
    parts = sorted(geom.geoms, key=lambda p: p.area, reverse=True)
    keep = [parts[0]] + [p for p in parts[1:] if p.area >= MIN_ISLAND_M2]
    return keep[0] if len(keep) == 1 else MultiPolygon(keep)


def rounded(geom):
    """GeoJSON geometry, clockwise outer rings (the winding d3 expects), 4 decimals (~10 m)."""
    if geom.geom_type == "Polygon":
        geom = orient(geom, sign=-1.0)
    else:
        geom = type(geom)([orient(p, sign=-1.0) for p in geom.geoms])
    g = mapping(geom)

    def ring(c):
        pts = [[round(x, 4), round(y, 4)] for x, y in c]
        pts = [p for i, p in enumerate(pts) if i == 0 or p != pts[i - 1]]
        return pts if len(pts) >= 4 else None

    def poly(rings):
        rs = [ring(r) for r in rings]
        return None if rs[0] is None else [r for r in rs if r]
    if g["type"] == "Polygon":
        g["coordinates"] = poly(g["coordinates"])
    else:
        g["coordinates"] = [p for p in (poly(x) for x in g["coordinates"]) if p]
    return g


def inside_point(g):
    c = g.centroid
    return c if g.contains(c) else g.representative_point()


def read_population(path):
    if not path:
        return {}
    for enc in ("utf-8-sig", "latin-1"):  # SAPS files are not always UTF-8
        try:
            with open(path, encoding=enc, newline="") as f:
                return {r["GUID"]: int(r["T1_1AGETT"]) for r in csv.DictReader(f) if r.get("T1_1AGETT")}
        except UnicodeDecodeError:
            continue
    return {}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("flows")
    ap.add_argument("eds")
    ap.add_argument("saps", nargs="?")
    ap.add_argument("--counties", default="GALWAY,GALWAY CITY")
    ap.add_argument("--name", default="Galway")
    a = ap.parse_args()
    counties = [c.strip().upper() for c in a.counties.split(",")]

    # ---- boundaries
    where = "COUNTY_ENGLISH IN (%s)" % ",".join("'%s'" % c.replace("'", "''") for c in counties)
    ed = gpd.read_file(a.eds, where=where).to_crs(2157)
    if ed.empty:
        raise SystemExit(f"No EDs found for {counties}: check --counties against COUNTY_ENGLISH in {a.eds}")
    ed["geometry"] = ed.geometry.buffer(0)
    ed["is_city"] = ed.COUNTY_ENGLISH.str.endswith(" CITY")
    ed["area_name"] = ed.CSO_LEA.str.title()
    areas_geo = ed.dissolve("area_name").geometry
    area_city = ed.groupby("area_name").is_city.max()
    city_names = sorted({c.title() for c in ed.loc[ed.is_city, "COUNTY_ENGLISH"]})

    # Order electoral areas: city areas first, then the rest clockwise around the city (or county centre),
    # so neighbouring areas sit next to each other in the matrix.
    hub = (areas_geo[area_city[area_city].index].union_all() if area_city.any() else areas_geo.union_all()).centroid

    def bearing(name):
        p = inside_point(areas_geo[name])
        return (math.degrees(math.atan2(p.x - hub.x, p.y - hub.y)) + 360) % 360
    order = sorted(areas_geo.index, key=lambda n: (not area_city[n], bearing(n) if not area_city[n] else 0, n))
    area_idx = {n: i for i, n in enumerate(order)}

    ed = ed.sort_values(["area_name", "ED_ENGLISH"]).reset_index(drop=True)
    ed_idx = {g: i for i, g in enumerate(ed.ED_GUID)}
    pop = read_population(a.saps)

    ed_simple = ed.geometry.simplify(ED_TOLERANCE_M, preserve_topology=True).apply(drop_islets)
    to_ll = lambda geoms: gpd.GeoSeries(geoms, crs=2157).to_crs(4326)
    ed_ll = to_ll(list(ed_simple))
    pts_ll = to_ll([inside_point(g) for g in ed.geometry])
    area_ll = to_ll([drop_islets(areas_geo[n].simplify(AREA_TOLERANCE_M)) for n in order])
    area_pts = to_ll([inside_point(areas_geo[n]) for n in order])

    eds = [{"name": r.ED_ENGLISH.title(), "area": area_idx[r.area_name], "city": bool(r.is_city),
            "pop": pop.get(r.ED_GUID), "c": [round(pts_ll[i].x, 4), round(pts_ll[i].y, 4)]}
           for i, r in ed.iterrows()]

    # ---- flows
    flows = defaultdict(int)
    out, inn = defaultdict(lambda: defaultdict(int)), defaultdict(lambda: defaultdict(int))
    total = 0
    with open(a.flows, encoding="utf-8-sig", newline="") as f:  # CSO files start with a byte-order mark
        for r in csv.DictReader(f):
            o, d, n = ed_idx.get(r["RESIDENCE_CSOED_GUID"]), ed_idx.get(r["POWSCC_CSOED_GUID"]), int(r["COUNT"])
            if o is None and d is None:
                continue
            total += n
            if o is not None and d is not None:
                flows[(o, d)] += n
            elif o is not None:
                out[o][bucket(r["POWSCC_COUNTY_LABEL"], r["POWSCC_CSOED_LABEL"])] += n
            else:
                inn[d][bucket(r["RESIDENCE_COUNTY_LABEL"], r["RESIDENCE_COUNTY_LABEL"])] += n
    if not flows:
        raise SystemExit("No flows matched the ED GUIDs: is this the ED-to-ED commuting file?")

    data = {
        "name": a.name, "census": 2022, "city": city_names[0] if len(city_names) == 1 else None,
        "areas": [{"name": n, "city": bool(area_city[n]), "c": [round(area_pts[i].x, 4), round(area_pts[i].y, 4)]}
                  for i, n in enumerate(order)],
        "eds": eds,
        "ed_shapes": {"type": "FeatureCollection", "features": [
            {"type": "Feature", "properties": {"i": i}, "geometry": rounded(g)} for i, g in enumerate(ed_ll)]},
        "area_shapes": {"type": "FeatureCollection", "features": [
            {"type": "Feature", "properties": {"i": i}, "geometry": rounded(g)} for i, g in enumerate(area_ll)]},
        "flows": [[o, d, n] for (o, d), n in sorted(flows.items())],
        "out": {str(k): dict(v) for k, v in sorted(out.items())},
        "in": {str(k): dict(v) for k, v in sorted(inn.items())},
    }
    OUT.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    inner = sum(flows.values())
    print(f"{OUT.relative_to(HERE)}: {len(eds)} EDs, {len(order)} electoral areas, {len(flows)} ED pairs, "
          f"{inner:,} trips within {a.name}, {total - inner:,} to or from elsewhere, {OUT.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
