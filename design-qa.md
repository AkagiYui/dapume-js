# Jianpu layout design QA

- Source visual truth: `C:/Users/pleas/AppData/Local/Temp/codex-clipboard-602ef267-56e2-4f4f-ac18-0b4ef8772702.png`
- Implementation: `http://127.0.0.1:5173/workbench/088e3ae2-22cb-43f9-9647-396ca08969e1`
- Viewport: 1280 × 720, light theme, side-by-side editor and Jianpu view
- State: nine-measure example score, Jianpu selected, measure 5 selected

## Full-view comparison evidence

The rendered score uses the reference's publication-style structure: four continuous measures per system, bar numbers `(1)`, `(5)`, `(9)` at the left, compact key/time/tempo metadata, plain paper background, no card grid, and no chord lane. At the measured desktop state, systems are 75.2 px tall and begin at y=93.3, 186.9, and 280.5; each full system is 544 px wide and fits the preview without horizontal overflow.

## Focused region comparison evidence

- Fonts and typography: score glyphs use bundled x-Vacle; degree numbers are 17.3 px, bold, with compact octave dots, duration underlines, dots, accidentals, extensions, and ties.
- Spacing and rhythm: each of four measures is 122.6 px wide; system gap is 18.4 px; metadata and the first system are separated by less than one line of score height.
- Colors and tokens: plain application paper background and near-black notation match the reference; only the existing selected/playing states introduce subtle semantic fills.
- Image quality/assets: the reference contains no required product imagery for this embedded score view; notation remains crisp font/CSS output at every scale.
- Copy/content: key, stacked 4/4 time signature, tempo, system numbers, notes, and rests are present. Chord labels and the chord performance track are intentionally hidden per the current requirement.

## Findings

No actionable P0/P1/P2 mismatch remains within the embedded workbench constraints. The source is a full printed page with title/credits/footer; these are intentionally omitted because the workbench already supplies document title and application chrome.

## Patches made

- Replaced measure cards and beat guides with continuous four-measure systems.
- Compressed notation and system spacing and removed horizontal overflow at the desktop split width.
- Hidden chord tracks while retaining their parsed data.
- Reused the piano-roll follow setting and centered the active system on play, seek, or navigation.

## Implementation checklist

- [x] Four measures per system with 1/5/9 numbering
- [x] Publication-style bars, typography, duration and octave marks
- [x] Chord lane hidden
- [x] Selected measure and active note/measure states retained
- [x] Automatic follow verified on a generated 28-measure score
- [x] Desktop and mobile overflow behavior verified

final result: passed
