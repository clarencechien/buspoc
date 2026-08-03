#!/usr/bin/env python3
"""Phase 3 analysis over filtered historical RealTimeNearStop events.

Definition (fixed before analysis, per handoff §5):
  「實際到站」= A2EventType == 1 (進站事件) 的 GPSTime,
  以 (PlateNumb, StopUID, TripStartTime) 去重,同一車同一趟取最早一筆。

Outputs, for weekday evening peak 17:00–19:30 (arrivals sampled
16:45–19:45 so gaps spanning the window edges are counted):

  Number 1 — headway routes (57 / 706 / 243) at the two Liancheng-axis
  boarding stops: actual inter-arrival gap p50/p90, bunching share
  (gap < 3 min), and expected wait for a random arrival, per route and
  for the merged "any usable bus" stream.

  Number 2 — 橘3 timetable adherence: actual arrival at 錦和路/建一路 vs
  scheduled departure from 中和站 (17:00 17:20 17:50 18:20 19:00 19:40 20:20).

Usage: python3 analyze.py hist/rtns_*.ndjson
"""
import json
import statistics
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone

TZ = timezone(timedelta(hours=8))

# (route label, RouteUID, boarding StopUID, stop label)
HEADWAY_TARGETS = [
    ("57", "NWT16468", "NWT127715", "連城中正路口"),
    ("57", "NWT16468", "NWT127717", "台貿一村"),
    ("706", "NWT10196", "NWT35122", "連城中正路口"),
    ("706", "NWT10196", "NWT35124", "台貿一村"),
    ("243", "NWT10172", "NWT34492", "台貿一村"),
]
ORANGE3 = ("橘3", "NWT16466")
# 跳蛙 (捷運頂溪站-捷運頂埔站) toward 頂溪 = Direction 1; TDX has no published
# timetable for this direction, so reconstruct the de-facto one from events.
FROG = ("跳蛙", "NWT18538")
FROG_STOP = ("NWT207493", "連城中正路口")
ORANGE3_STOPS = {"NWT127562": "錦和路", "NWT127563": "建一路"}
ORANGE3_RIDE = ("NWT127563", "NWT127574")  # 建一路 → 仁愛路(一) in-vehicle time
RIDE_PAIRS = {
    "橘3 建一路→仁愛路(一)": ("NWT16466", "NWT127563", "NWT127574"),
    "57 連城中正路口→捷運頂溪站": ("NWT16468", "NWT127715", "NWT127730"),
    "706 連城中正路口→捷運頂溪站": ("NWT10196", "NWT35122", "NWT35134"),
    "跳蛙 連城中正路口→捷運頂溪站": ("NWT18538", "NWT207493", "NWT207499"),
}
ORANGE3_SCHED_EVENING = ["17:00", "17:20", "17:50", "18:20", "19:00", "19:40", "20:20"]

WIN_START, WIN_END = (16, 45), (19, 45)  # local sampling window
CORE_START, CORE_END = (17, 0), (19, 30)


def load_arrivals(paths):
    """→ {(RouteUID, StopUID): {date: sorted [datetime]}} deduped per trip."""
    seen = set()
    arr = defaultdict(lambda: defaultdict(list))
    trips = defaultdict(dict)  # (plate, TripStartTime) -> {StopUID: datetime}
    for p in paths:
        with open(p, encoding="utf-8-sig") as f:
            for line in f:
                r = json.loads(line)
                want_dir = 1 if r["RouteUID"] == FROG[1] else 0
                if r.get("A2EventType") != 1 or r.get("Direction") != want_dir:
                    continue
                key_ids = (r["RouteUID"], r["StopUID"])
                t = datetime.fromisoformat(r["GPSTime"]).astimezone(TZ)
                trip = (r.get("PlateNumb"), r["StopUID"], r.get("TripStartTime"))
                if trip in seen:
                    continue
                seen.add(trip)
                arr[key_ids][t.date()].append(t)
                for _label, (ruid, a, b) in RIDE_PAIRS.items():
                    if r["RouteUID"] == ruid and r["StopUID"] in (a, b):
                        trips[(r.get("PlateNumb"), r.get("TripStartTime"))][r["StopUID"]] = t
    for v in arr.values():
        for lst in v.values():
            lst.sort()
    return arr, trips


def in_win(t, start, end):
    return start <= (t.hour, t.minute) <= end


def gap_stats(days):
    """days: {date: [datetimes]} → gaps within sampling window, pooled."""
    gaps = []
    for lst in days.values():
        w = [t for t in lst if in_win(t, WIN_START, WIN_END)]
        gaps += [(b - a).total_seconds() / 60 for a, b in zip(w, w[1:])]
    if not gaps:
        return None
    gaps.sort()
    n = len(gaps)
    mean = sum(gaps) / n
    ew = sum(g * g for g in gaps) / (2 * sum(gaps))  # E[wait] for random arrival
    return {
        "n_gaps": n,
        "p50": round(statistics.median(gaps), 1),
        "p90": round(gaps[int(0.9 * (n - 1))], 1),
        "max": round(gaps[-1], 1),
        "mean": round(mean, 1),
        "expected_wait_random_arrival": round(ew, 1),
        "bunching_lt3min": round(sum(1 for g in gaps if g < 3) / n, 2),
    }


def main():
    paths = sys.argv[1:]
    if not paths:
        sys.exit("usage: analyze.py hist/rtns_*.ndjson")
    arr, trips = load_arrivals(paths)
    dates = sorted({d for v in arr.values() for d in v})
    print(f"days analyzed: {[str(d) for d in dates]}\n")

    print("== Number 1: actual gaps, weekday 17:00–19:30 (sampled 16:45–19:45) ==")
    result = {}
    for route, ruid, suid, stop in HEADWAY_TARGETS:
        s = gap_stats(arr.get((ruid, suid), {}))
        result[f"{route}@{stop}"] = s
        print(f"{route:>4} @ {stop}: {s}")

    # merged stream per boarding stop
    for stop, uids in [
        ("連城中正路口 (57+706)", [("NWT16468", "NWT127715"), ("NWT10196", "NWT35122")]),
        ("台貿一村 (57+706+243)", [("NWT16468", "NWT127717"), ("NWT10196", "NWT35124"), ("NWT10172", "NWT34492")]),
    ]:
        merged = defaultdict(list)
        for k in uids:
            for d, lst in arr.get(k, {}).items():
                merged[d] += lst
        for lst in merged.values():
            lst.sort()
        s = gap_stats(merged)
        result[f"merged@{stop}"] = s
        print(f"merged @ {stop}: {s}")

    print("\n== Number 2: 橘3 schedule adherence (dep 中和站 vs arrival 錦和路/建一路) ==")
    o3 = {}
    for suid, name in ORANGE3_STOPS.items():
        days = arr.get((ORANGE3[1], suid), {})
        rows = []
        for d, lst in days.items():
            for sched in ORANGE3_SCHED_EVENING:
                hh, mm = map(int, sched.split(":"))
                st = datetime(d.year, d.month, d.day, hh, mm, tzinfo=TZ)
                cands = [t for t in lst if -5 <= (t - st).total_seconds() / 60 <= 18]
                if cands:
                    delta = round((min(cands) - st).total_seconds() / 60, 1)
                    rows.append((str(d), sched, delta))
        deltas = sorted(r[2] for r in rows)
        if deltas:
            n = len(deltas)
            o3[name] = {
                "n_matched": n,
                "delta_p10": deltas[int(0.1 * (n - 1))],
                "delta_p50": round(statistics.median(deltas), 1),
                "delta_p90": deltas[int(0.9 * (n - 1))],
                "spread_p90_p10": round(deltas[int(0.9 * (n - 1))] - deltas[int(0.1 * (n - 1))], 1),
            }
            print(f"橘3 @ {name}: {o3[name]}")
            missed = len(dates) * len(ORANGE3_SCHED_EVENING) - n
            print(f"   scheduled slots without a matched arrival: {missed}")
        else:
            print(f"橘3 @ {name}: no matches")
    result["orange3"] = o3

    print("\n== in-vehicle times, boarding 16:45–19:45 ==")
    result["ride_times"] = {}
    for label, (ruid, a, b) in RIDE_PAIRS.items():
        rides = sorted(
            (v[b] - v[a]).total_seconds() / 60
            for v in trips.values()
            if a in v and b in v and timedelta() < v[b] - v[a] < timedelta(minutes=45)
            and in_win(v[a], WIN_START, WIN_END)
        )
        if rides:
            n = len(rides)
            result["ride_times"][label] = {
                "n": n,
                "p50": round(statistics.median(rides), 1),
                "p90": round(rides[int(0.9 * (n - 1))], 1),
            }
            print(f"{label}: {result['ride_times'][label]}")

    print("\n== Bonus: 跳蛙 (往頂溪, dir 1) actual passages at 連城中正路口, 15:00–20:00 ==")
    frog_days = arr.get((FROG[1], FROG_STOP[0]), {})
    frog_out = {}
    for d in dates:
        times = [t.strftime("%H:%M") for t in frog_days.get(d, []) if in_win(t, (15, 0), (20, 0))]
        frog_out[str(d)] = times
        print(f"  {d}: {times}")
    result["frog_passages"] = frog_out

    with open("phase3_result.json", "w") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    print("\nwrote phase3_result.json")


if __name__ == "__main__":
    main()
