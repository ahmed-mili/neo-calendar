# Contributing to Neo Calendar

## Branch structure

Everything happens on `main`. A release is a tag `vX.Y.Z` on `main`: the
`release.yml` workflow builds the Windows installer and the Android APK, signs
their update metadata and attaches them to the GitHub release. Installed apps
update themselves from there. A `release/vX.Y.Z` branch does the same, for the
case where only branches can be pushed.

See [docs/guide/release.md](guide/release.md) for what the three numbers mean
and what `git ship` does.

## Local development setup

```powershell
npm install        # no flag: the fast-check conflict is settled by overrides
npm test           # the full suite
npm run dev        # the desktop app (Vite + Tauri)
```

[docs/guide/develop.md](guide/develop.md) has the repository layout, the
Android build, the emulator, and how to add a wallpaper.

Read `CLAUDE.md` at the root before changing anything: it says what the event
panel takes for granted, and where a request that is not handled straight away
has to be written down so it is not lost.

## Before opening a pull request

- `npm test` passes.
- A change to the interface has been **seen running**, not only tested. The
  desktop app runs with `npm run dev`; the phone has an emulator script.
- The commit message says what changes for the person using the app, in one
  line, not what was refactored.

## Reporting

Bugs go to the [issues page](https://github.com/ahmed-mili/neo-calendar/issues).
Say which platform, which version (Settings shows it), and what you expected
instead.
