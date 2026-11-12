# How the app feels to a beginner and to an amateur font maker

*Review of the Aksharajanani font creator · 11 November 2026 · branch `claude`, after commit `a902b80` · reviewed by Claude, with the author*

A beginner can draw a whole font without help, and the app quietly does the hard parts that normally need a typographer. The trouble starts after drawing: spacing, a few badly timed tips, saving, and the words on the screen. None of it needs a redesign.

**Contents:** [Verdict](#verdict) · [How this was reviewed](#how-this-was-reviewed) · [The journey, step by step](#the-journey-step-by-step) · [The help guide](#the-help-guide) · [The amateur font maker](#the-amateur-font-maker) · [Expert tools](#expert-tools) · [What already works](#what-already-works) · [What to do first](#what-to-do-first)

---

## Verdict

The core idea works: pick your language, write each letter over a guide, and get a real font that joins letters and places accents correctly. For complex scripts like Tamil, that's something no other beginner tool does well. Progressive disclosure also works: in a normal run, a beginner never sees the rules editor, the comparison view or the script tools.

What holds the app back is concentrated in a few places. These are the ones I'd fix before a public release:

- **Spacing is the one step a beginner can't do alone.** Five unexplained steps, the word "kerning" everywhere, and in Tamil it can never get past 36%.
- **The pen can silently change a letter's spacing** when a stroke starts on a spacing line.
- **Tips arrive while you draw**, some with a dark overlay that eats the next stroke or click.
- **Work lives only in the browser,** and the backup is labelled "Export JSON".
- **The screen still talks like a type designer** ("Latin Letters", "Side Bearings", "OTF", "Glyph", "Kerning") and gives fonts internal names like "RomanSimple".

### Scorecard by step

| Step | Status | In short |
|---|---|---|
| Start | Works well | Clear language tiles, new tagline |
| Grid | Small fixes | Jargon tab names, internal font name |
| Drawing | **Fix first** | Tips mid-letter, pen moves spacing |
| Accents & joins | Small fixes | Hidden "Accept all", nested accents |
| Spacing | **Needs work** | Five steps, jargon, Tamil stuck at 36% |
| Test & Creator | Small fixes | Undrawn letters look drawn |
| Export | Small fixes | Vague warning, OTF only |
| Saving | **Fix first** | Browser-only storage, unclear backup |

---

## How this was reviewed

- **Eight complete fonts built through the real app** by an automated "user": English, Spanish, French, Portuguese, German, Greek, Cyrillic and Tamil. Each one drew every glyph, placed the accents, spaced, tested, used Creator and exported, and every run was recorded on video (`videos/`).
- **Two walkthroughs of every other screen** as a first-time visitor, with all tips left on: start screen, Help, About, tutorial, the four "other ways to start", grid, editor, properties, More menu, filters, command palette, Compare, Settings, Spacing, Test, Creator, Export, both rules editors, and phone width.
- **Reading the code behind each screen,** to separate design choices from bugs.

A script is not a beginner. It knew where every button was, so the real test is still to watch two or three people who have never seen the app. Findings with an ID (D16, U14…) are already in `REVIEW_ISSUES.md`. Those marked **New** are not logged yet.

---

## The journey, step by step

Each finding is in the order a newcomer meets it. Severity is about the person using the app:

- **Blocker** stops or misleads them.
- **High** costs work or trust.
- **Medium** confuses.
- **Low** is polish.

### 1. First visit and the start screen

**✓ Good: Language tiles by region, with plain names**
"Hindi, Marathi, Nepali" with "Devanagari" underneath, and "Russian, Ukrainian, Bulgarian" for Cyrillic, are exactly right for this audience. The new subtitle "Where your handwriting becomes a font" says what the app is for.

**Low · New: The "IAST" tile is a code, not a language**
Every other tile names a language; this one is an acronym only scholars know.
*Suggestion:* "Sanskrit in English letters" with "IAST" underneath, like the Devanagari tile.

**Medium · New: Help and About don't cover the whole screen**
On a laptop-sized window, the start screen's script tiles and a second footer show underneath the Help and About content, so the pages look broken.
*Suggestion:* give both pages the full screen height, or hide the start screen while they're open.

**Medium · U17: Help and About speak to experts**
Help sections are called "Templates & Built-in Intelligence", "Advanced: Virtual vs. Baked Glyphs" and "Positioning Rules Editor". About's "The Smart Engine" talks about "Indic scripts" and "OpenType logic".
*Suggestion:* rewrite in the voice of the subtitle. A short "Make your first font in 5 steps" page would do more than the current guide. Move the technical sections under "For script builders".

### 2. Starting a project

**Medium · New: Fonts get internal names: "RomanSimple", "SpanishSimple", "TamilRegular"**
That name shows on the grid and on the Recent Projects card, and it becomes the name of the installed font. An English beginner's font is called "Roman".
*Suggestion:* default to "My English font", and ask for a name once, at the first export ("What should your font be called?").

**Low · New: "Create Empty Project" asks for Units Per Em, Ascender and Descender**
It sits next to "Import Font" under "Other ways to start", so a beginner may try it.
*Suggestion:* keep the defaults and fold those three fields under "Advanced".

### 3. The character grid

**Medium · New: Tab and section names use type jargon**
"Latin Letters" (in English, Spanish, French, German and Portuguese), "Punctuations & Others", "Cons. half", "Cons. with II". The rest of the app avoids "Latin", but the grid, Compare and the editor's side list still say it.
*Suggestion:* "Letters", "Punctuation & symbols"; for Tamil, write the forms out ("Consonants with ீ"). This is data plus `locales`, no code.

**High · New: A grid tip with a dark overlay blocks every click**
"Understanding Characters: cards with dashed borders are placeholders…" opens with a full-screen overlay just as you come back from the editor. Until you press OK, nothing on the grid responds. It stopped the Tamil test run.
*Suggestion:* make grid tips non-blocking like the toolbar tour (click anywhere to dismiss), and never open one within a few seconds of arriving on a screen.

**Low · New: Four icon-only buttons in the header**
Search, filter, compare and multi-select are bare icons. They do have hover names, but a beginner sees four mystery buttons next to the big "Export Font".
*Suggestion:* fine for now. If the header gets reworked, give them short labels on wide screens or group them under one "View" button.

**High · U20: "Accept All" for auto-made letters is hidden in a filter**
It only appears after choosing "Auto-Generated" or "To Be Reviewed" in the funnel menu. Otherwise every accented letter (49 in Tamil, 26–28 in French, Portuguese and Cyrillic) has to be opened and accepted one by one.
*Suggestion:* an "Accept auto-generated (n)" button next to the progress bar whenever n > 0.

### 4. Drawing a letter

**✓ Good: Guide letter, guide lines and the Next arrow**
The faint guide letter in the script's own font, the dashed guide lines and the Next arrow make drawing a whole alphabet quick and obvious. The pen is selected from the start, and the first tip says exactly what to do.

**Blocker · D16: A stroke that starts on a spacing line moves the spacing instead**
The pen grabs the letter's left or right spacing line whenever a stroke starts on it. A crossbar on `t` silently changed its spacing, so the letter overlapped its neighbour in every word.
*Suggestion:* drag the spacing lines only from a small handle at the top or bottom.

**High · U14: Tips open while you're drawing, and eat strokes**
Between letters 1 and 4 of the walkthrough, three tips arrived over the canvas: "Test Your Font" (after one letter), "Adjusting Spacing" and "Export Font". Each had a dark overlay, and in the recorded runs one swallowed the bowl of `B` and `D`.
*Suggestion:* show Test and Export tips on the grid after you leave the editor. Never show a tip while the pen is down or right after a stroke.

**Medium · New: The spacing tip uses jargon and invites the bug above**
"The vertical lines are your Side Bearings. Drag the LSB (Left) or RSB (Right) lines…" appears on the second letter, which is exactly when people start drawing near those lines.
*Suggestion:* "The two upright lines set the space on each side of the letter." Show it later (after five letters), and only once D16 is fixed.

**Medium · New: The donation bar covers the bottom of the canvas mid-drawing**
After the third letter, a full-width dark bar ("please consider supporting its development") slides over the bottom of the editor, across the area below the baseline where tails go.
*Suggestion:* ask after the first export, the moment someone has received value, and in a spot that doesn't cover the work.

**Low · New: Glyph Properties mixes plain and expert words**
"Left Space" and "Right Space" are perfect. Next to them: "Label (Ghost)", "Codepoint U+0045", "Classification", "Construction".
*Suggestion:* keep the two spaces at the top. Put the rest under a collapsed "Advanced".

### 5. Accents and joined letters

**✓ Good: The app builds most accented and joined letters itself**
Linked letters (கி, i) update by themselves, placed accents come with a sensible suggestion and a big "Accept", and letters built from parts (Æ, ஆ) open pre-filled. This is the app's biggest advantage over other tools.

**Medium · New: "Starting point" letters look finished when they aren't**
In Tamil, ஆ opens as அ and ஞூ as ஞு, and the user is meant to add the missing stroke. Nothing says so, and the card counts as done, so a beginner can export ஆ that looks exactly like அ (the first Tamil test run did).
*Suggestion:* mark these letters "Finish me" and leave them out of "completed" until they've been edited once. Say in the editor what to add.

**Medium · K19: Accents on already-accented letters can't be finished**
Greek ΐ ΰ and 8 Sanskrit-transliteration letters stay unfinished, so Greek progress stops at 117/119 and "your font is ready" never appears. The export itself is fine.
*Suggestion:* use a letter's built shape when it has no drawing of its own (one shared fix with K20).

**Low · New: "Detach" in the placement editor**
"Detach" next to "Accept" and "Reset" doesn't say what happens to the letter.
*Suggestion:* "Draw this letter myself", with a short note that it stops following the base letter.

### 6. Spacing

**Blocker · U16: Five steps nobody explains**
All Pairs → Select All (both sides) → Auto-kern → Suggestions → Accept. The first screen a beginner sees is an empty "Generate a Custom Kerning Grid". In Tamil, Select All means 36,828 pairs and a minute-long font build, while the script's 3,295 suggested pairs sit on another tab.
*Suggestion:* one button, "Space all letters automatically", which uses the suggested pairs where the script has them, then shows the result with Undo.

**Blocker · K20: Tamil spacing can never pass 36%**
3,047 of Tamil's 3,297 suggested pairs include a letter the app builds (கீ, க், கி…). Spacing treats those as "not drawn" and hides them, so they never get spaced, even in the exported font. Malayalam, Telugu and Kannada are likely affected too.
*Suggestion:* treat a letter as ready when its parts are done, and measure it by its built shape.

**High · U18: The Spacing tab talks about "kerning"**
"Auto-kern", "new pairs kerned", "Kerning Pair", and a first tip titled "What is Kerning?" The tab itself already says Spacing, and about 50 strings say kern.
*Suggestion:* "Auto-space", "pairs spaced", "Add pair"; keep "kerning" for expert screens.

**Medium · U19: After auto-spacing, every pair stays in the list**
In English, 4,345 of 10,000 pairs changed, scattered among the ones that didn't.
*Suggestion:* show only what changed, with a "Show all pairs" switch.

**✓ Fixed · K18: Auto-spacing no longer squeezes capitals together**
VE used to touch. Every checked pair in the 8 test fonts now keeps the normal gap where the letters come closest.

### 7. Testing and Creator

**Medium · New: Letters you haven't drawn look drawn on the Test page**
With five letters done, the preview shows those five in your handwriting and the other 90 in the browser's bold serif, at the same size and colour. You can't tell which letters are yours. Creator does the same.
*Suggestion:* show missing letters as faint boxes (or grey) and add a line like "90 letters not drawn yet". Start the text box with a sentence in the font's language, not the whole alphabet.

**Low · New: "Font Testing Ground" and "Input Text (Default Font)"**
The title and labels describe how the page is built.
*Suggestion:* "Try your font"; "Type here"; "Your font".

**Low · U15: Creator's back and download buttons are bare icons**
*Suggestion:* add labels: "Back" and "Download image".

### 8. Exporting and using the font

**Medium · New: The export warning is vague, and Escape doesn't close it**
"The following tasks are incomplete: Character Grid. The exported font may have issues." It doesn't say what's missing or what "issues" means, and the red "Export Anyway" makes a normal action look dangerous. Pressing Escape leaves it open.
*Suggestion:* "95 letters aren't drawn yet. They'll be missing from the font." with "Export what I have" and "Keep drawing", and close on Escape.

**Medium · New: OTF only, and no "how do I use this?"**
The tip calls it "the OTF file". People want to use their font in Word, Canva, on a website or on a phone. There's no WOFF2 for the web, no TTF, and no help on installing.
*Suggestion:* after export, show a short "Use your font" card: install on Windows or Mac, upload to Canva, use on a website. Add WOFF2 when the web matters.

**Medium · S17: Everyday punctuation is missing in European languages**
A Spanish font can't write "¡Hola!" or "¿Qué?"; French, Portuguese, Greek and Russian lack « ».
*Suggestion:* add at least ¡ ¿ for Spanish and « » for French and Russian.

### 9. Saving and safety

**High · New: Hours of drawing live only in the browser**
Projects are kept in browser storage ("Recent Projects (Local Browser)"), and the app doesn't ask the browser to keep it. Browsers can clear it, Safari after a few days without a visit, and so does clearing site data. The real backup is "Export JSON" in the More menu.
*Suggestion:* ask the browser for persistent storage (`navigator.storage.persist()`), rename "Export JSON" to "Download a backup of this project", and remind people to back up after their first 10 letters and at every export.

**Medium · New: Five ways to save, with similar names**
Save, Save Copy…, Export JSON, Export Template, Take Snapshot / Restore Snapshot. A beginner can't tell which one protects their work.
*Suggestion:* autosave covers "Save". Keep "Download backup" and "Save a copy" in plain view. Move Template and Snapshot under "Advanced".

**Low · New: Reloading the page goes back to the start screen**
Nothing is lost (the project is under Recent Projects), but you lose your place.
*Suggestion:* reopen the last project on reload.

### 10. Settings

**Low · New: Settings speak type-designer, and labels overlap**
"Contrast Ratio (Thick/Thin)", "Monoline (Uniform)", "Path Smoothing", "Units Per Em", "Super Topline Guide". In the Metrics preview, the "Baseline" labels draw on top of each other.
*Suggestion:* for the pen: "Line thickness", "Thick and thin strokes (like a calligraphy pen)", "Smooth my lines". Put Metrics and Font details under "Advanced". Fix the overlapping labels.

### 11. Phone and tablet

**✓ Good: The layout holds up on a phone**
No sideways scrolling on the start screen (the "Other ways to start" row scrolls on its own), the canvas takes touch and stylus input, and the header shrinks to icons. Earlier layout work checked the grid and editor at many sizes.

**Low · New: No pen pressure**
On a tablet with a stylus, lines don't get thicker when you press harder. The calligraphy pen covers part of that.
*Suggestion:* worth considering later; handwriting fonts from a stylus feel much more personal with pressure.

---

## The help guide

**Verdict: you're right, it doesn't help the people the app is for.** The guide (`locales/help/en.json`, 21 sections, about 16,000 characters, same in Tamil) is written for type designers, puts the beginner's path near the end, and parts of it describe an app that no longer exists.

### Who it's written for

Nearly every section assumes typography knowledge: GSUB, GPOS, FEA, Bézier curves, anchors, side bearings, advance width, PUA, "Virtual vs. Baked Glyphs", "Lookup Execution Order". It describes the app as "a powerful, web-based font design tool tailored for Indic scripts" for "professional-quality OpenType fonts". The new subtitle promises the opposite: write by hand, get a font.

### The order

| # | Section | What a beginner needs |
|---|---|---|
| 1–2 | Introduction, The Font Creation Process | ✓ but in jargon |
| 3–7 | Character grid & Bézier curves, Glyph properties, Glyph types, Ligatures, Virtual vs. Baked | Expert material |
| **8** | **Starting a Project** | This should be first |
| 9–13 | Templates, Positioning Rules Editor, Rules Manager, OpenType Rules & FEA, Kerning | Mostly expert |
| 14–17 | Creator, Project management, Settings, Shortcuts | Partly useful |
| **18** | **Test page** | Belongs in the main path |
| 19–21 | Troubleshooting, Export & PUA, Supported Scripts | "Supported Scripts" is **empty** |

Nothing covers what a beginner actually does: accepting the app's accents and joined letters, spacing in one step, exporting, **installing and using the font**, or **backing up the project**.

### What's wrong or out of date (checked against the code)

- **Drawing tools.** It describes a "Pen Tool for precise shapes using Bézier curves", a "Pencil Tool" and "rectangles". The real pen is freehand (drag to draw), there's no pencil or rectangle tool, and the Calligraphy Pen, Eraser, Slice, Line, Curve and Dot tools aren't mentioned.
- **Shortcuts.** `Ctrl+S` "Save Project" has no handler anywhere. Previous/next letter is plain `←`/`→`, not `Ctrl+←`/`→`. `Ctrl+K` (command palette) and `Ctrl+X` (cut) are missing.
- **Starting a project.** "Four ways to start" lists four; the start screen has six (tutorial, Load Saved Project, Import Font, Create Empty Project, Build from Unicode Blocks, Create Custom Project).
- **Spacing.** The section is titled "Workspace: Kerning" (the tab says Spacing), and calls the button "Discover New Pairs" (it says "Detect new pairs").
- **Creator.** "Use the purple Create button": the button is white.
- **Troubleshooting.** "Ensure the Base glyph has the anchor 'top' and the Mark glyph has '_top'" comes from other font editors. This app places accents by the edges of each letter (top-centre, bottom-right…), with no named anchors, so the advice can't be followed.
- **Supported Scripts** has a title and no content.

### Format

One long accordion of 21 sections with no pictures, no search, and no way for a tip or an error message to link to the right section. The Help page also doesn't fill the screen (see section 1).

### What it should be instead

A short main guide for the beginner path, plus a separate section for script builders. The end-to-end videos and screenshots can supply the pictures.

1. **Your first font in 5 steps:** choose your language → write each letter over the guide → accept the accents and joined letters → space all letters → try it and export. One screenshot or short clip per step.
2. **Using your font:** install on Windows or Mac, use in Word, Canva, on a website, on a phone. Includes "change the name when you re-export" (the font-cache tip, now buried in Troubleshooting).
3. **Keeping your work safe:** where projects are stored, how to download a backup and open it again.
4. **Questions:** in plain words. "Why is this letter greyed out?", "Why does my ஆ look like அ?", "Why do letters overlap?", "What do dashed cards mean?", "I closed the tab, where is my font?"
5. **Drawing tools:** the 12 real tools, one line each, in a table.
6. **Keyboard shortcuts:** the correct list.
7. **For script builders:** today's expert material (glyph types, ligatures, virtual vs. baked, positioning rules, OpenType rules, FEA, PUA, templates, custom scripts), corrected (no anchors) and kept as it is otherwise.

Writing 1–6 is about a day plus your Tamil review; section 7 is mostly moving and correcting what exists. This replaces U17's help part.

---

## The amateur font maker

Someone who has made a font or two, or wants a usable font for a project, cares about different things than a beginner. Here's how the app looks to them.

### What they'll like

- Joining rules, accent placement and vowel signs are already built for 20 scripts. That's normally weeks of OpenType work.
- Auto-spacing that keeps an even gap (now that K18 is fixed).
- Glyph Comparison, to check that letters match in height and weight.
- Import from an existing font, SVG, or a traced image, as a starting point.
- Font details (designer, licence, URLs) in Settings.
- A full rules editor for when the defaults aren't enough.

### What they'll miss

- **Only one style.** No bold or italic family; every project is a single style.
- **Only OTF.** No WOFF2 for websites.
- **No versioning on export.** Re-exporting under the same internal name makes the operating system mix up old and new copies; a version number in the font would help.
- **No spacing test strings.** The classic "HOH HOOH nonn" lines for judging rhythm, by script.
- **No size waterfall** on the Test page (the same line at 12, 18, 24, 48 px).
- **Missing punctuation** in several languages (S17).

> **Where the app sits:** it's a *handwriting-to-font* tool with real script knowledge, not a font editor. That's the right place to be. The amateur additions worth doing are the cheap ones: a version number, WOFF2, test strings and a waterfall. Bold and italic families are a much bigger project.

---

## Expert tools

These are powerful and stay out of a beginner's way, which is right. Two labels promise something gentler than what opens.

| Menu item | What opens | Suggestion |
|---|---|---|
| More → Character Behavior | "OpenType Rules": Script Tag DFLT, Lookups, Features, FEA Code, "Add Single Sub" | Call it "Advanced: OpenType rules", or add a one-line explanation at the top |
| More → Positioning Rules | "Manage Rules": Groups & Classes, Anchors, `$consonantswithTails` | "Advanced: accent placement rules"; its Back button is labelled "Cancel", which reads as "discard" |
| Start → Create Custom Project | Upload `scripts.json`, `characters.json`, `positioning.json`, `rules.json` | Fine for script builders; link to the data docs |
| Start → Import Font | "Edit Mode (Experimental) … GSUB, GPOS" | Fine; say in plain words what Edit Mode keeps |
| Grid → Filter | Bases, Ligatures, Marks, Auto-Generated, To Be Reviewed | Fine as an expert filter once "Accept all" moves out of it (U20) |

---

## What already works

- The step tabs ("1. Character Grid", "2. Spacing") show the path without a mode switch, and later steps appear only when they make sense.
- "Your font is ready" hands people on to spacing at the right moment.
- The tutorial is optional, clearly offered on the start screen, and runs in its own small project.
- The command palette (Ctrl+K) finds every screen and action.
- Every drawing tool has a name on hover, and the toolbar tour closes when you click the canvas.
- Exported fonts are correct: in all 8 test fonts, letters, accents, joins and spacing render as drawn, with no page errors in any run.

---

## What to do first

Ordered by how much each one helps a first-time user, against the effort. The first eight together are roughly a week of work.

| # | Change | Fixes | Effort |
|---|---|---|---|
| 1 | One "Space all letters automatically" button, spacing words instead of "kerning", show only changed pairs | U16, U18, U19 | 1–2 days |
| 2 | Spacing lines move only from a handle | D16 | ½ day |
| 3 | Built letters count as ready and use their built shape | K20, K19 | 1–2 days |
| 4 | Tips: none while drawing, none with a blocking overlay; Test and Export tips on the grid; plain spacing-tip wording | U14 + new | ½ day |
| 5 | Persistent storage, "Download a backup", backup reminders; simplify the five save options | New | ½ day |
| 6 | "Accept auto-generated (n)" on the grid | U20 | ½ day |
| 7 | Friendly default font names, and ask for a name at first export | New | ½ day |
| 8 | Clear export warning; Escape closes dialogs; "Use your font" card after export | New | ½ day |
| 9 | Plain names: "Letters", "Punctuation & symbols", Sanskrit tile, Test page labels, Settings wording | New, U17 | 1 day + Tamil review |
| 10 | Missing letters shown as missing on Test and Creator | New | ½ day |
| 11 | Donation ask after the first export, not over the canvas | New | 1 hour |
| 12 | Help pages fill the screen; rebuild Help as described in [The help guide](#the-help-guide) | New, U17 | 1 day + Tamil review |
| 13 | "Finish me" marking for starting-point letters (ஆ, ஞூ) | New | ½ day |
| 14 | Punctuation for Spanish, French and Russian | S17 | 1–2 hours per language |
| 15 | Watch 2–3 beginners use it, without help | Everything above | An afternoon |

The new findings here aren't in `REVIEW_ISSUES.md` yet. Once you've decided which to take on, they can go in as numbered issues.
