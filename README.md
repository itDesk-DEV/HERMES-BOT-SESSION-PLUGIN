# Bot Session Pane for Hermes Desktop

Release package for the **Sesje Bota / Bot Session Pane** extension for Hermes Desktop.

## Current release

- **Release date:** September 29, 2026
- **Tested Hermes checkout:** `aa96575ed11c`
- **Archive:** [`Bot-Session-Pane-2026-09-29.zip`](./Bot-Session-Pane-2026-09-29.zip)
- **SHA-256:** `3c7836f6d25bf67fc5fac970445e24081fdc081a834afd5fc66d8417926cf836`

The full unpacked release is also in [`Bot-Session-Pane-2026-09-29/`](./Bot-Session-Pane-2026-09-29/).

## Installation

1. Download and extract the ZIP archive.
2. Close all Hermes Desktop windows.
3. In PowerShell, run:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\Install-BotSessionPane.ps1
   ```

4. Start Hermes Desktop:

   ```powershell
   hermes desktop
   ```

Read the release [`README.md`](./Bot-Session-Pane-2026-09-29/README.md) before installing. The extension includes a Desktop plugin plus a small, version-checked core patch for Bot Mode, full-text search, Bot Chat handling, session rename, archive and safe deletion.

## Safety

The installer uses `git apply --check`, makes a backup under the recipient's Hermes home, and refuses to patch an incompatible Hermes source tree. No passwords, tokens, session databases, or chat transcripts are included.
