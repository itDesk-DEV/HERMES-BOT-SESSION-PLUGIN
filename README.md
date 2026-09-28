# Bot Session Pane for Hermes Desktop

Release package for the **Sesje Bota / Bot Session Pane** extension for Hermes Desktop.

## Current release

- **Release date:** September 28, 2026
- **Tested Hermes checkout:** `802ae8544b`
- **Archive:** [`Bot-Session-Pane-2026-09-28.zip`](./Bot-Session-Pane-2026-09-28.zip)
- **SHA-256:** `634a4d56236879469f0163f2479677e80304b92eb904856c2456c51a326cd82d`

The full unpacked release is also in [`Bot-Session-Pane-2026-09-28/`](./Bot-Session-Pane-2026-09-28/).

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

Read the release [`README.md`](./Bot-Session-Pane-2026-09-28/README.md) before installing. The extension includes a Desktop plugin plus a small, version-checked core patch for Bot Mode and full-text search.

## Safety

The installer uses `git apply --check`, makes a backup under the recipient's Hermes home, and refuses to patch an incompatible Hermes source tree. No passwords, tokens, session databases, or chat transcripts are included.
