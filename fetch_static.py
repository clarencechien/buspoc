#!/usr/bin/env python3
"""Phase 1 static-data validation for the Zhonghe→Yonghe bus MVP.

Reads TDX_CLIENT_ID / TDX_CLIENT_SECRET from environment variables.
Never writes credentials to disk.

Outputs:
  stops.json        — pinned StopUID mapping for the 4 boarding stops
  phase1_raw/       — cached raw API responses (git-ignored)
  phase1_result.json — route × alighting-stop × distance table + schedules
"""
import json
import math
import os
import sys
import time
import gzip
import urllib.parse
import urllib.request

BASE = "https://tdx.transportdata.tw/api/basic/v2"
AUTH_URL = "https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token"

ORIGIN = {"name": "第一銀行連城分行", "lat": 24.99663, "lon": 121.48691}
DEST = {"name": "臺灣銀行新永和分行", "lat": 25.01309, "lon": 121.51276}

BOARDING = {
    "連城中正路口": {"axis": "liancheng", "position": "upstream"},
    "台貿一村": {"axis": "liancheng", "position": "downstream"},
    "錦和路": {"axis": "jinhe", "position": "upstream"},
    "建一路": {"axis": "jinhe", "position": "downstream"},
}

CACHE_DIR = os.environ.get("PHASE1_CACHE", "phase1_raw")

_last_call = [0.0]


def _throttle():
    # shared egress IP hits TDX per-IP limits easily; stay slow
    wait = 1.5 - (time.time() - _last_call[0])
    if wait > 0:
        time.sleep(wait)
    _last_call[0] = time.time()


def get_token():
    cid = os.environ.get("TDX_CLIENT_ID")
    sec = os.environ.get("TDX_CLIENT_SECRET")
    if not cid or not sec:
        sys.exit("Set TDX_CLIENT_ID and TDX_CLIENT_SECRET environment variables.")
    data = urllib.parse.urlencode(
        {"grant_type": "client_credentials", "client_id": cid, "client_secret": sec}
    ).encode()
    req = urllib.request.Request(AUTH_URL, data=data)
    with urllib.request.urlopen(req) as r:
        return json.load(r)["access_token"]


TOKEN = None


def api(path, cache_key, **params):
    """GET with gzip, throttle, 429 backoff, and on-disk caching."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    cache = os.path.join(CACHE_DIR, cache_key + ".json")
    if os.path.exists(cache):
        with open(cache) as f:
            return json.load(f)
    global TOKEN
    if TOKEN is None:
        TOKEN = get_token()
    params.setdefault("$format", "JSON")
    url = f"{BASE}/{path}?" + urllib.parse.urlencode(params)
    for attempt in range(6):
        _throttle()
        req = urllib.request.Request(
            url,
            headers={"Authorization": "Bearer " + TOKEN, "Accept-Encoding": "gzip"},
        )
        try:
            with urllib.request.urlopen(req) as r:
                raw = r.read()
                if r.headers.get("Content-Encoding") == "gzip":
                    raw = gzip.decompress(raw)
                data = json.loads(raw)
                with open(cache, "w") as f:
                    json.dump(data, f, ensure_ascii=False)
                return data
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 5:
                delay = 10 * (attempt + 1)
                print(f"  429 on {path}, backing off {delay}s", file=sys.stderr)
                time.sleep(delay)
                continue
            raise
    raise RuntimeError(f"gave up on {url}")


def haversine_m(lat1, lon1, lat2, lon2):
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def find_boarding_stop_candidates():
    """Stop-name search near the fixture coordinates, per city."""
    out = {}
    for name in BOARDING:
        cands = []
        for city in ("NewTaipei", "Taipei"):
            res = api(
                f"Bus/Stop/City/{city}",
                f"stops_{city}_{name}",
                **{"$filter": f"contains(StopName/Zh_tw,'{name}')"},
            )
            for s in res:
                d_origin = haversine_m(
                    ORIGIN["lat"], ORIGIN["lon"],
                    s["StopPosition"]["PositionLat"], s["StopPosition"]["PositionLon"],
                )
                if d_origin < 2500:  # discard same-name stops elsewhere
                    cands.append(
                        {
                            "city": city,
                            "StopUID": s["StopUID"],
                            "name": s["StopName"]["Zh_tw"],
                            "lat": s["StopPosition"]["PositionLat"],
                            "lon": s["StopPosition"]["PositionLon"],
                            "bearing": s.get("Bearing"),
                            "address": s.get("StopAddress"),
                            "dist_from_origin_m": round(d_origin),
                        }
                    )
        out[name] = cands
    return out


def discover_routes():
    """Resolve the fixture route names to actual TDX routes (both cities)."""
    routes = {}
    for city in ("NewTaipei", "Taipei"):
        for pat in ("57", "243", "706", "214", "橘3", "跳蛙"):
            res = api(
                f"Bus/Route/City/{city}",
                f"route_{city}_{pat}",
                **{"$filter": f"contains(RouteName/Zh_tw,'{pat}')"},
            )
            for r in res:
                nm = r["RouteName"]["Zh_tw"]
                routes.setdefault((city, nm), r)
    return routes


def stops_of_route(city, route_name):
    return api(
        f"Bus/StopOfRoute/City/{city}/{urllib.parse.quote(route_name)}",
        f"sor_{city}_{route_name}",
    )


def schedule_of_route(city, route_name):
    return api(
        f"Bus/Schedule/City/{city}/{urllib.parse.quote(route_name)}",
        f"sched_{city}_{route_name}",
    )


# fixture routes resolved from stage-1 discovery: (city, exact RouteName)
TARGET_ROUTES = [
    ("NewTaipei", "57"),
    ("NewTaipei", "243"),
    ("NewTaipei", "706"),
    ("NewTaipei", "853跳蛙"),
    ("NewTaipei", "939跳蛙"),
    ("NewTaipei", "橘3"),
    ("Taipei", "214直"),
    ("Taipei", "214"),
]

BOARDING_NAMES = list(BOARDING)


def analyze_route(city, route_name):
    """For each subroute/direction: locate boarding stops and alighting
    stops (after the boarding stop, within 800 m of the destination)."""
    out = []
    for sub in stops_of_route(city, route_name):
        if sub["RouteName"]["Zh_tw"] != route_name:
            continue
        stops = sub["Stops"]
        board_hits = {}
        for i, s in enumerate(stops):
            nm = s["StopName"]["Zh_tw"]
            if nm in BOARDING_NAMES:
                d = haversine_m(
                    ORIGIN["lat"], ORIGIN["lon"],
                    s["StopPosition"]["PositionLat"], s["StopPosition"]["PositionLon"],
                )
                if d < 1200:
                    board_hits[nm] = {
                        "seq": s["StopSequence"], "index": i,
                        "StopUID": s["StopUID"],
                        "lat": s["StopPosition"]["PositionLat"],
                        "lon": s["StopPosition"]["PositionLon"],
                        "dist_from_origin_m": round(d),
                    }
        alight = []
        first_board_idx = min((h["index"] for h in board_hits.values()), default=None)
        if first_board_idx is not None:
            for s in stops[first_board_idx + 1:]:
                d = haversine_m(
                    DEST["lat"], DEST["lon"],
                    s["StopPosition"]["PositionLat"], s["StopPosition"]["PositionLon"],
                )
                if d <= 800:
                    alight.append(
                        {
                            "seq": s["StopSequence"],
                            "StopUID": s["StopUID"],
                            "name": s["StopName"]["Zh_tw"],
                            "dist_to_dest_m": round(d),
                        }
                    )
        out.append(
            {
                "city": city,
                "route": route_name,
                "SubRouteUID": sub.get("SubRouteUID"),
                "Direction": sub.get("Direction"),
                "n_stops": len(stops),
                "first_stop": stops[0]["StopName"]["Zh_tw"],
                "last_stop": stops[-1]["StopName"]["Zh_tw"],
                "boarding_hits": board_hits,
                "alight_within_800m": sorted(alight, key=lambda a: a["dist_to_dest_m"]),
            }
        )
    return out


def main():
    result = {"origin": ORIGIN, "destination": DEST}

    print("== boarding stop candidates ==")
    cands = find_boarding_stop_candidates()
    result["boarding_candidates"] = cands
    for name, lst in cands.items():
        print(f"{name}: {len(lst)} candidates within 2.5km")

    print("\n== route discovery ==")
    routes = discover_routes()
    names = sorted({nm for (_c, nm) in routes})
    print(len(routes), "city-route pairs;", "names:", ", ".join(names))
    result["route_names_found"] = [
        {"city": c, "route": nm, "RouteUID": r["RouteUID"]} for (c, nm), r in sorted(routes.items())
    ]

    print("\n== task 1.1 + 1.2: pin StopUIDs and verify alighting stops ==")
    analysis = []
    for city, rn in TARGET_ROUTES:
        try:
            analysis.extend(analyze_route(city, rn))
        except urllib.error.HTTPError as e:
            print(f"  {city}/{rn}: HTTP {e.code}")
    result["route_analysis"] = analysis
    for a in analysis:
        if not a["boarding_hits"]:
            continue
        print(f"\n{a['route']} ({a['city']}) dir={a['Direction']} "
              f"{a['first_stop']}→{a['last_stop']} ({a['n_stops']} stops)")
        for nm, h in sorted(a["boarding_hits"].items(), key=lambda kv: kv[1]["seq"]):
            print(f"  board {nm} seq={h['seq']} {h['StopUID']} ({h['dist_from_origin_m']}m from origin)")
        if a["alight_within_800m"]:
            for al in a["alight_within_800m"][:5]:
                print(f"  alight seq={al['seq']} {al['name']} {al['StopUID']} → {al['dist_to_dest_m']}m to dest")
        else:
            print("  alight: NONE within 800m after boarding stop")

    print("\n== task 1.3: schedules ==")
    schedules = {}
    for city, rn in TARGET_ROUTES:
        try:
            schedules[f"{city}/{rn}"] = schedule_of_route(city, rn)
        except urllib.error.HTTPError as e:
            print(f"  {city}/{rn}: HTTP {e.code}")
    result["schedules"] = schedules

    with open("phase1_result.json", "w") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    print("\nwrote phase1_result.json")


if __name__ == "__main__":
    main()
