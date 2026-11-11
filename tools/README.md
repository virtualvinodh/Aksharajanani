# tools/

Scripts for testing the app from the outside: driving it in a real browser, checking the script
data, and inspecting the fonts it exports. None of this is part of the app or its build.
Everything they write goes to `out/` folders, which git ignores.

(The checks that run as npm scripts, such as `npm run check:translations`, live in `scripts/`.)

## Setup

The browser scripts use Playwright, which isn't a project dependency. Install it once:

```sh
npm i --no-save playwright && npx playwright install chromium
```

`npm install` or `npm ci` removes it again, so re-run that line after either.
Set `CHROME_PATH=/path/to/chrome` to use a different Chromium.

The browser scripts expect the app to be running already, by default at `npm run dev` (http://localhost:3000/).
To test the production build, run `npm run build && npm run preview` and pass `BASE=http://localhost:4173/`.

The font scripts need fontTools (plus uharfbuzz for `fontcheck.py`). The easiest way to get them is [uv](https://docs.astral.sh/uv/):
`uv run --with fonttools --with uharfbuzz python3 tools/font/...`.

## Browser

### `e2e/e2e.cjs`: build a whole font, end to end

Does what a person would do, in any of the European scripts or Tamil:

1. Starts a new project.
2. Draws every glyph with the pen: European letters from the hand-made strokes in `e2e/alphabet.cjs`, Tamil from strokes traced from its guide font (`e2e/strokes/tamil.json`, see below). Letters the app builds from others (Æ, ஆ) are opened and kept as built.
3. Positions the accented letters (the first by hand, the rest with "Accept Default Position").
4. Auto-kerns in Spacing and accepts the result: the script's suggested pairs if it has any (Tamil), otherwise every pair (All Pairs → Select All).
5. Types a sample on the Test page.
6. Makes a picture in Creator and saves it.
7. Exports the font and shows it rendered by the browser.

```sh
node tools/e2e/e2e.cjs                       # English
SCRIPT=spanish node tools/e2e/e2e.cjs     # english spanish french portuguese german greek cyrillic tamil
SCRIPT=spanish VIDEO=1 node tools/e2e/e2e.cjs  # also record a video (with on-screen captions)
DEBUG_GLYPHS=D,t SCRIPT=spanish node tools/e2e/e2e.cjs  # draw only these glyphs, one screenshot each (dbg-<glyph>-<code point>.png)
```

Output goes to `tools/e2e/out/<script>/`:
- numbered screenshots of each step (`FAILED.png` if a step fails);
- `<script>.otf` (the exported font) and `<script>-studio.png` (the Creator picture);
- `summary.json` (glyphs drawn and positioned, page errors);
- with `VIDEO=1`, `<script>.webm`.

A run takes about 7 minutes (Tamil about 25). The log and `summary.json` say how long the Test page and the export took to build the font. To get an mp4, use `ffmpeg -i english.webm -c:v libx264 -pix_fmt yuv420p english.mp4`.

Adding another script means:
- adding it to `CONFIG` in `e2e.cjs` (its id in `scripts.json`, a sample for the Test page, a line for Creator);
- giving it strokes: run `trace-glyphs.py` (below), or add hand-made ones to `alphabet.cjs`. Hand-made strokes win only for glyphs the app builds from others, where they're drawn on top (Ґ = Г + upturn).

The run also skips a Spacing step if the script doesn't have one.

### `e2e/trace-glyphs.py`: strokes from a font

Shapes every glyph of a script with a font (by default its guide font from `scripts.json`, downloaded once),
thins each one to its centre line and traces that into pen strokes on the script's guide lines.

```sh
uv run --with fonttools --with uharfbuzz --with freetype-py --with scikit-image --with pillow \
    python3 tools/e2e/trace-glyphs.py tamil [font.otf] [reference-glyph]
```

Writes `tools/e2e/strokes/<script>.json` (kept in git, so runs don't need Python) and a preview of every traced
glyph, `tools/e2e/out/trace-<script>.png`. Glyphs the font lacks are listed at the end; give those hand-made
strokes in `alphabet.cjs`.

The script reads the glyph list and set names from `data/` and `locales/en.json`.

Two things in the script work around app behaviour that is still open in REVIEW_ISSUES.md:
- **D16:** a stroke that starts on a spacing line is drawn from its other end.
- **U14:** a stroke cut off by a tip is drawn again.

### `layout-sweep.cjs`: layout at many screen sizes

Seeds a small Tamil project and a small Devanagari one. At each viewport it screenshots these screens:
- the grid;
- the editor (normal, maximised, with a selection, with properties open);
- Spacing;
- the Test page;
- Positioning.

For each screen it reports:
- header and canvas sizes;
- page scroll;
- whether the toolbar is clipped or overlaps something;
- buttons that can't be clicked, and what covers them.

```sh
node tools/layout-sweep.cjs
VPS=1280x800,390x844 node tools/layout-sweep.cjs
```

Output goes to `tools/out/layout/` (screenshots and `report.txt`).

## Data checks (no browser)

| Script | Checks |
|---|---|
| `checks/script-data.py` | Every script in `scripts.json`: all glyphs that rules, positioning, kerning and composites refer to are defined; classes resolve; marks are classed as marks; substitution outputs exist. |
| `checks/data-files.py` | Invalid JSON and duplicate keys in `data/`, unresolved references per rules file, data files no script uses. |
| `checks/locales.cjs` | `en` vs `ta` for the app, help and tutorial: duplicate keys, missing or extra keys, empty or untranslated values, `{placeholder}` mismatches. |

```sh
python3 tools/checks/script-data.py
python3 tools/checks/data-files.py
node tools/checks/locales.cjs
```

## Fonts

| Script | Does |
|---|---|
| `font/fontcheck.py font.otf "To" "ñ"` | Tables, glyph count, empty glyphs, GSUB/GPOS features, and how HarfBuzz shapes the given text. |
| `font/kerndump.py font.otf` | A few glyphs' metrics, the most negative kerning pairs, any positive ones. |
| `font/glyphsvg.py font.otf out.svg "DtB"` | Draws glyphs with origin and advance marked, to compare against what was drawn. |
| `font/svg2png.cjs out.svg out.png` | Renders that SVG to PNG. |
