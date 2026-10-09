"""Bundle web/ into one self-contained HTML file (for hosts that serve a single page).

Usage: python3 scripts/build_single_file.py [output.html]   (default: dist/personality-test.html)
Run scripts/build_web.py first if the model or questions changed.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "dist" / "personality-test.html"

css = (ROOT / "web" / "style.css").read_text()
js = {n: (ROOT / "web" / n).read_text() for n in ("data.js", "scoring.js", "insights.js", "i18n.js", "app.js")}
for name, src in js.items():
    assert "</script" not in src.lower(), f"{name} contains a closing script tag"

page = f"""<title>Personality Test</title>
<style>
{css}
</style>
<main id="app"></main>
<script>
{js['data.js']}
{js['scoring.js']}
{js['insights.js']}
{js['i18n.js']}
{js['app.js']}
</script>
"""
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(page)
print(f"wrote {out} ({out.stat().st_size / 1024:.0f} KB)")
