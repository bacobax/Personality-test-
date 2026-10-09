"""Download and extract every dataset listed in data/item_mapping.json into data/raw/.

Usage: python3 scripts/fetch_datasets.py
"""
import json
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
RAW.mkdir(parents=True, exist_ok=True)

mapping = json.loads((ROOT / "data" / "item_mapping.json").read_text())
for name, ds in mapping["datasets"].items():
    if (RAW / ds["file"]).exists():
        print(f"{name}: already present")
        continue
    zip_path = RAW / Path(ds["url"]).name
    print(f"{name}: downloading {ds['url']}")
    urllib.request.urlretrieve(ds["url"], zip_path)
    with zipfile.ZipFile(zip_path) as z:
        z.extractall(RAW)
    zip_path.unlink()
    assert (RAW / ds["file"]).exists(), f"{name}: {ds['file']} not found after extraction"
print("done")
