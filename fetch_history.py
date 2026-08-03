#!/usr/bin/env python3
"""Stream TDX historical RealTimeNearStop day-dumps and keep only the
four target routes (橘3 / 57 / 706 / 243, New Taipei).

The historical endpoints ignore OData $filter and return a full-day
NDJSON dump (~900 MB raw, ~1.4 M records) with a UTF-8 BOM, so we
decompress and filter the stream line by line and never touch disk with
the full payload.

Usage: TDX_CLIENT_ID=... TDX_CLIENT_SECRET=... python3 fetch_history.py 2026-07-21 2026-07-22 ...
Output: hist/rtns_<date>.ndjson (only kept routes)
"""
import http.client
import json
import os
import sys
import time
import zlib
import urllib.parse
import urllib.request

AUTH_URL = "https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token"
URL = "https://tdx.transportdata.tw/api/historical/v2/Historical/Bus/RealTimeNearStop/City/NewTaipei"

KEEP_MARKERS = [
    '"RouteUID":"NWT16466"',  # 橘3
    '"RouteUID":"NWT16468"',  # 57
    '"RouteUID":"NWT10196"',  # 706
    '"RouteUID":"NWT10172"',  # 243
    '"RouteUID":"NWT18538"',  # 跳蛙 捷運頂溪站-捷運頂埔站
]

OUT_DIR = os.environ.get("HIST_DIR", "hist")


def get_token():
    data = urllib.parse.urlencode(
        {
            "grant_type": "client_credentials",
            "client_id": os.environ["TDX_CLIENT_ID"],
            "client_secret": os.environ["TDX_CLIENT_SECRET"],
        }
    ).encode()
    with urllib.request.urlopen(urllib.request.Request(AUTH_URL, data=data)) as r:
        return json.load(r)["access_token"]


def fetch_day(token, date):
    out_path = os.path.join(OUT_DIR, f"rtns_{date}.ndjson")
    if os.path.exists(out_path):
        print(f"{date}: already have, skip")
        return
    req = urllib.request.Request(
        URL + "?Dates=" + date,
        headers={"Authorization": "Bearer " + token, "Accept-Encoding": "gzip"},
    )
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=1800) as r:
                gz = r.headers.get("Content-Encoding") == "gzip"
                dec = zlib.decompressobj(16 + zlib.MAX_WBITS) if gz else None
                buf = b""
                kept = total = 0
                tmp = out_path + ".part"
                with open(tmp, "wb") as out:
                    while True:
                        chunk = r.read(1 << 20)
                        if not chunk:
                            break
                        buf += dec.decompress(chunk) if dec else chunk
                        *lines, buf = buf.split(b"\n")
                        for ln in lines:
                            total += 1
                            s = ln.lstrip(b"\xef\xbb\xbf")
                            if any(m.encode() in s for m in KEEP_MARKERS):
                                out.write(s + b"\n")
                                kept += 1
                    if dec:
                        buf += dec.flush()
                    s = buf.strip().lstrip(b"\xef\xbb\xbf")
                    if s and any(m.encode() in s for m in KEEP_MARKERS):
                        out.write(s + b"\n")
                        kept += 1
                os.rename(tmp, out_path)
                print(f"{date}: kept {kept}/{total} records")
                return
        except urllib.error.HTTPError as e:
            if e.code == 429:
                delay = 30 * (attempt + 1)
                print(f"{date}: 429, sleep {delay}s")
                time.sleep(delay)
                continue
            raise
        except (http.client.IncompleteRead, ConnectionError, TimeoutError, urllib.error.URLError) as e:
            # stream cut mid-download; restart the day from scratch
            if os.path.exists(out_path + ".part"):
                os.remove(out_path + ".part")
            delay = 15 * (attempt + 1)
            print(f"{date}: stream broke ({type(e).__name__}), retry in {delay}s")
            time.sleep(delay)
    print(f"{date}: gave up", file=sys.stderr)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    token = get_token()
    for date in sys.argv[1:]:
        fetch_day(token, date)
        time.sleep(5)


if __name__ == "__main__":
    main()
