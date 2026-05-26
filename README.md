# Rep Trainer

A single-file web app for drilling triads on your instrument. Pick the roots, qualities, and inversions you want to work on, set a session length, and run timed reps with an optional metronome. Pause to jot a note when something clicks (or doesn't); past sessions and notes are saved locally.

**Live:** https://sonnybardhan.github.io/rep-trainer/

## Features

- Configurable card pool — any combination of 15 root spellings × qualities (maj/min/dim/aug) × inversions
- Session modes: fixed rep count or fixed minutes
- Auto-advance by tap, seconds, beats, or bars
- Built-in metronome with adjustable tempo, time signature, and accent
- Focus items + per-card stress tagging (low / medium / high) for spaced review
- Session history with notes, persisted in `localStorage`
- Light/dark theme

## Stack

One `index.html`. No build, no dependencies, no backend. Hosted on GitHub Pages from `main` / root.

## Local development

```
open index.html
```

That's it. Edit, refresh, commit, push — Pages redeploys automatically.
