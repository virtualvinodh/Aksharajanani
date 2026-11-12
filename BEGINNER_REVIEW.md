# Aksharajanani through a beginner's eyes

*Persona-based UX review · 12 November 2026 · branch `claude` · by Claude, for the author*

You design type and work in FontCreator and FontLab every day, so words like *glyph*, *side bearing* or *mark class* no longer register as jargon. This review sets that knowledge aside on purpose: four invented people, each with a real reason to make a font and no type training, walk through the app as it is today. Every friction point below comes from something seen in the end-to-end runs, the screen walkthroughs or the code; the personas only decide whose eyes it's seen through.

It complements [UX_REVIEW.md](UX_REVIEW.md) (the step-by-step review) and [REVIEW_ISSUES.md](REVIEW_ISSUES.md) (the numbered issues); IDs like U16 point there.

> **Caveat.** Personas are informed guesses, not research. They tell you where to look; watching three or four real people (section 7) tells you what's true.

---

## 1. Four people who might use it

| | **Meena** | **Arjun** | **Lucía** | **Ravi** |
|---|---|---|---|---|
| Who | Primary-school teacher, Chennai, 40s | Engineering student, Kochi, 20 | Bullet-journal and lettering hobbyist, Seville, 30s | Graphic designer, Hyderabad, 30s |
| Script | Tamil | Malayalam | Spanish | Telugu (client work) and English |
| Device | Laptop with a touchpad; school tablet | Phone first, laptop for "real" work | iPad with Apple Pencil | Mac with mouse and Wacom |
| Knows | Word, WhatsApp, a little Canva | Instagram, Canva, CapCut | Procreate, Canva, Etsy | Illustrator, a little Glyphs Mini; has heard "kerning" |
| Doesn't know | What a font file is; any type terms | Type terms; patience for long tasks | Type terms; that fonts have "rules" | Indian-script OpenType; mark positioning |
| Wants | Worksheets in their own handwriting | A font of their handwriting for posts and a logo | Their lettering as a font to sell on Etsy | A Telugu display font for a client, fast |
| Success | Types their name in Word in their own handwriting | Uses it in Canva the same evening | A font file they can sell, looking even and professional | Joins, signs and spacing right, no OpenType coding |
| Leaves when | Something feels broken or "too technical" | It takes more than an evening | The result looks amateur | It can't do what's needed, or hides it |

The app's audience note (laypeople who know no typography) fits Meena, Arjun and Lucía. Ravi is the amateur who'll push it further and tell others.

---

## 2. Their walk through the app

### Meena (Tamil, laptop, low confidence)

| Step | What happens | What Meena thinks | Ref |
|---|---|---|---|
| Start | Clear tiles; "Tamil" is easy to find; the tagline says *your handwriting becomes a font* | "This is for me." | ✓ |
| First letter | Guide letter behind the canvas, pen ready, one tip saying what to do | "Ah, I trace over it." | ✓ |
| Letters 1–4 | Tips about Test, side bearings and Export open over the canvas; one swallows a stroke | "Did I do something wrong? Where did my line go?" | U14 |
| Letter 7 | Meena starts a stroke near the edge; it moves a spacing line instead of drawing | Doesn't notice. The letter will overlap its neighbours later. | D16 |
| Letters 30–90 | The Next arrow carries Meena along; touchpad drawing is slow and wobbly | "This will take all weekend." No sense of how far there is to go. | new |
| ஆ, ஞூ… | Some letters open already drawn (from அ, ஞு); nothing says to add the missing part | Leaves ஆ looking like அ. | UX_REVIEW §5 |
| 49 accented forms | Each has to be opened and accepted; "Accept All" is hidden in a filter | Gives up after ten, or never finds them. | U20 |
| "Your font is ready" | Celebration; sends Meena on to Spacing | "Ready? Then why another step?" | — |
| Spacing | "What is Kerning?" tip; All Pairs, Select All, Auto-kern, Suggestions, Accept; stuck at 36% whatever Meena does | Lost. Closes the tab. | U16, U18, K20 |
| Export | If Meena gets here: "OTF file"; no idea how to get it into Word | Asks a nephew. | UX_REVIEW §8 |
| Next week | Opens the site; browser storage may have been cleared | The work is gone. | UX_REVIEW §9 |

**Verdict for Meena:** Meena can draw every letter, but will most likely stop at Spacing. What Meena needs most: no surprises while drawing, one button for spacing, and a clear "you're done; here's how to use it".

### Arjun (Malayalam, phone first, impatient)

| Step | What happens | What Arjun thinks | Ref |
|---|---|---|---|
| Phone | Layout holds up; drawing with a finger works | "Okay, nice." | ✓ |
| Count | 210 letters before the font is "complete" | "I just want my name and a few words." | new |
| Positioning | "Drawing complete! Go to Positioning"; Rule Details shows 564 pairs on 16 pages of "Accept Page" | "What are pairs? Why 16 pages?" | K21, U20 |
| Font name | The font is called "MalayalamRegular" | "Can I rename it?" (only via a small pencil icon) | UX_REVIEW §2 |
| Canva | Exports an OTF on the phone | Doesn't know where it went or how Canva takes it. | new |

**Verdict for Arjun:** Arjun needs a *quick font*: the letters Arjun actually uses, a usable result in 20 minutes, and the rest later. The app currently treats "complete" as all 210 glyphs.

### Lucía (Spanish, iPad and Pencil, cares about quality)

| Step | What happens | What Lucía thinks | Ref |
|---|---|---|---|
| Drawing | Pencil works, but there's no pressure; strokes are one thickness | "My lettering has thick and thin strokes." Finds the calligraphy pen only by hovering over tool icons. | UX_REVIEW §11 |
| Consistency | Draws letter by letter, never sees them in words while drawing | The x-heights drift; it only shows in Test. | new |
| Test page | Letters not drawn yet show in a serif fallback, same colour | "Which of these are mine?" | UX_REVIEW §7 |
| Spacing | Default gap is 2–4× looser than professional fonts | "It looks letter-spaced, amateur." Finds "Default LSB" only in Settings → Metrics. | K23, U22 |
| Punctuation | Spanish has no ¡ ¿ | "I can't sell a Spanish font without ¡ and ¿." | S17 |
| Selling | Licence field exists in Settings → Font Meta Data | "Which licence? What do I put?" | new |

**Verdict for Lucía:** the app produces a font, but not one Lucía would sell yet. What's needed: pressure (or a clear thick/thin pen), words-in-context while drawing, tighter default spacing and the right punctuation.

### Ravi (Telugu, designer, the amateur)

| Step | What happens | What Ravi thinks | Ref |
|---|---|---|---|
| Building blocks | Letters are built from private-use blocks; `、` (a Chinese comma) appears as a tile to draw | "What is this?" | S19 |
| Built letters | Parts of స, న, the ో forms come out apart when drawn over the guide | "I drew exactly over the guide, why is it broken?" | K22 |
| Rules | "Character Behavior" opens "OpenType Rules" with lookups and FEA; good that it's there | "Powerful, but I'd never have found it under that name." | UX_REVIEW §Expert tools |
| Families | One style per project, no bold | "The client wants Regular and Bold." | UX_REVIEW §Amateur |
| Delivery | OTF only, no WOFF2, no version number | "I need web fonts and versioning." | UX_REVIEW §Amateur |

**Verdict for Ravi:** Ravi gets the most out of the script knowledge baked in, and is exactly the kind of person who'll recommend the app to others. Ravi needs K22 fixed, the expert tools findable, and basic delivery options.

---

## 3. Words a typographer stops hearing

Counted in the English interface text (`locales/en.json`, 959 strings), the help (42) and the tutorial (143):

| Word on screen | How often | Where a beginner meets it | Plain alternative |
|---|---|---|---|
| glyph | 78 app, 19 tutorial | Glyph Properties, "Add Glyph", Compare, tips | letter / character / shape |
| kerning, kern | 31 app, 12 tutorial | Spacing screen, celebrations ("Go to Kerning") | spacing, space letters |
| LSB, RSB, side bearing | Settings, tutorial tip on letter 2 | "Default LSB", "Drag the LSB (Left) or RSB (Right) lines" | space on the left / right |
| mark, base, class | 25+ | Positioning, "Class Representative", "Mark Attachment Classes" | accent, vowel sign; letter; "group of accents that move together" |
| ligature, composite, component | 30+ | Glyph Properties, help | joined letter; built from |
| OpenType, FEA, GSUB, GPOS, lookup | 40+ | "OpenType Feature Error", Rules screen, help | (keep for experts only; in errors, say what to do) |
| Latin, Indic | tabs, help | "Latin Letters" tab, "for Indic scripts" | Letters; name the languages |
| OTF | tips | "generate the OTF file" | your font file |
| metrics, ascender, descender, Units Per Em | Settings, Create Empty Project | Metrics tab | (expert only) |

Rule of thumb for the interface: if Meena would have to ask a nephew what a word means, it goes on an expert screen or gets replaced.

---

## 4. What to improve

**Drawing**
- Never interrupt a stroke: no tips while the pen is down, none with a dark overlay over the canvas (U14).
- Spacing lines move only from a handle (D16).
- Show progress as distance to a goal ("31 of 89 letters, about 40 minutes left"), not just a bar.
- "Starting point" letters (ஆ from அ) say what to add, and don't count as done until edited.

**Accents and joined letters**
- One visible "Accept everything the app made (n)" on the grid (U20), and "Accept all N" per rule instead of 16 pages (K21).
- Built letters must come out right when drawn over the guide (K22, K19).

**Spacing**
- One action: "Space all letters automatically", using the script's suggested pairs (U16), with a progress that can reach 100% (K20).
- "Space between letters" and "Space between words" on the Spacing screen, as sliders with a live line (U22), and a tighter default (K23).
- Say "spacing" everywhere (U18); after auto-spacing show only what changed (U19).

**Finishing**
- Ask for the font's name at first export; plain export warning; a "Use your font" card (Word, Canva, phone, website).
- Back up: ask the browser to keep storage, "Download a backup" in plain view, reminders.

**Words**
- Section 3's replacements across the beginner screens; expert names stay on expert screens.

---

## 5. What to add

| Addition | Why | Who it's for | Size |
|---|---|---|---|
| **Quick font**: draw just the letters you need (your name, a word, the alphabet only), get a usable font now, finish the rest later | 210 letters (Malayalam) or 160 (Tamil) before anything feels done is a wall | Arjun, Meena | Medium: a "start small" choice + a font that marks missing letters clearly |
| **Write on paper**: printable sheet per script with boxes and guide lines; photograph it; the app cuts it into letters | Many people write better with a pen; per-letter image import and tracing already exist, but one letter at a time | Meena, Lucía | Large; the most-asked feature in handwriting-font tools |
| **See it in words while drawing**: a strip under the canvas showing the current letter in a few words with letters already drawn | Catches height and weight drift as it happens instead of at Test | Lucía, everyone | Small–medium |
| **Consistency check** before export: letters noticeably taller, shorter or thicker than their neighbours | Turns "looks amateur" into a list of fixes | Lucía | Medium |
| **Pen pressure** on stylus (or a clearly named "thick and thin pen") | Lettering has contrast; the calligraphy pen is hidden behind an icon | Lucía | Medium |
| **"Use your font" guide** after export, per platform; WOFF2 for the web | People don't know what to do with an OTF | Everyone | Small (guide), small (WOFF2) |
| **Name, version and licence helper** at export ("For yourself / to share free / to sell" with a suggested licence) | Selling or sharing needs a name, a version and a licence | Lucía, Ravi | Small |
| **Language-ready punctuation** per language | ¡ ¿ « » „ № are missing | Lucía | Small per language (S17) |
| **Help where you are**: a "?" on each screen opening the right page of a short, plain guide | The current guide is one long expert accordion | Everyone | Medium (with the rewrite, U17) |

---

## 6. What to hide, rename or remove

- **Rename:** "Character Grid" → "Letters"; "Positioning" → "Accents" (or "Joining" for Indian scripts); "Spacing" stays; "Creator Studio" → "Make a picture"; "Character Behavior" → "Advanced: OpenType rules"; "Detach" → "Draw this letter myself".
- **Group under "Advanced"** (still one click away): Metrics, Font Meta Data (except name), filters by class, Compare, Test Cases, Rules, Positioning Rules, Export Template, Snapshots.
- **Header:** keep Export, Test, Create; fold search, filter, compare and multi-select into one "View" menu.
- **Remove from the beginner path:** the 14-step toolbar tour (replace with three tips at the moment each tool is first useful).

---

## 7. Check it with real people

An afternoon, three or four people who have never seen the app (none of them typographers), one at a time, 45 minutes each. Give a task, then watch and say nothing.

**Tasks**
1. "Make a font of your handwriting in your language. You have 30 minutes." (Do they find the start, draw comfortably, understand progress?)
2. "Now make your name look good in it." (Do they find Spacing? Do they understand it?)
3. "Put it in Word / Canva." (Export and installing.)
4. "Close the browser. Come back and continue." (Saving and trust.)

**Watch for**
- Where they hesitate for more than ten seconds, and what they say out loud.
- Every word they ask about (add it to section 3).
- Whether they reach "your font is ready", and whether they finish Spacing.

**Measure**
- Time to the first finished letter; letters drawn in 30 minutes.
- How many finish Spacing; how many get the font into another app.
- One sentence at the end: "Would you tell a friend about this?" and why.

---

## 8. Order of work

| When | What | Refs |
|---|---|---|
| **Now** (before release) | No interruptions while drawing; spacing-line handle; one-button spacing reaching 100%; Accept everything; backup and storage; export name and "Use your font"; plain words on beginner screens; tighter default spacing | U14, D16, U16, K20, U20, K21, K23, U18, U22, UX_REVIEW §8–9 |
| **Next** | Quick font; words-in-context strip; consistency check; help rewrite with "?" per screen; punctuation; K22 and K19 | S17, U17, K22, K19 |
| **Later** | Write on paper; pen pressure; WOFF2 and version/licence helper; bold/regular families | — |
| **Ongoing** | One real-person test after each "Now" milestone | §7 |
