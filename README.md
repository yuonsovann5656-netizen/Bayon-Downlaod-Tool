# Bayon Downloader

Bayon Downloader is a Windows Electron desktop application for downloading directly accessible media files and converting local media that you own or are authorized to process. Platform extraction for YouTube, TikTok and Facebook is intentionally disabled until a specific authorized integration is configured. The app does not bypass logins, DRM, paywalls, private access controls or anti-bot protections.

## Requirements

- Windows 10/11 x64.
- Node.js 22.12 or newer and npm (Node.js 24 LTS is recommended).
- For conversion: FFmpeg and FFprobe installed locally and available on PATH (`ffmpeg -version`, `ffprobe -version`). This project does not bundle FFmpeg binaries. Before redistributing them, review the selected FFmpeg build's GPL/LGPL configuration and all applicable notices, source offer and attribution obligations. No FFmpeg license compliance is implied by this app.

## Setup in VS Code

Open this folder in VS Code, choose **Terminal → New Terminal**, then run:

```powershell
npm install
npm run electron:dev
```

The `dev` command runs only the Vite renderer. `electron:dev` starts the Vite server and Electron together.

## Checks and builds

```powershell
npm run lint
npm test
npm run build
npm run build:electron
npm run package:win
npm run package:portable
```

Installer output uses the package version, for example `release/Bayon-Downloader-Setup-1.0.1.exe`. Portable output follows the same versioned naming pattern.

## GitHub Releases and automatic updates

The installed NSIS build checks the configured public GitHub Releases feed at startup and from **About → Check for updates**. Updates download in the background and the About page offers **Restart and install** when ready. Portable builds do not update in place. The repository is configured as `yuonsovann5656-netizen/Bayon-Downlaod-Tool`.

To publish an update, increment `version` in `package.json`, push a matching tag such as `v1.0.2`, and let the **Windows Release** workflow build and publish the NSIS installer and portable executable. GitHub Actions uses its repository `GITHUB_TOKEN`; no personal token is stored in the app. A release must be published before installed apps can discover a newer version. Public update checks do not require a user login.

## Features and limitations

- Direct HTTP(S) media download with streamed bytes, measured progress/speed when Content-Length is provided, cancellation, a configurable concurrent queue, safe partial-file cleanup and persistent completed history. A response must be video/audio or application/octet-stream.
- Downloads are restricted to public hosts; redirects are rejected to avoid redirect-based SSRF. Some hosts may require redirects or headers and will not work. Private DNS answers are rejected at the connection point and redirects are rejected. A URL must return video/audio or application/octet-stream; some hosts need redirects or headers and are unsupported.
- YouTube, TikTok and Facebook provider integrations are disabled. The platform selector explains that no authorized provider is configured. Add a provider only when permitted by the source and its terms.
- Local conversion uses FFprobe and FFmpeg by spawning fixed executable names with argument arrays (no shell). Import with the native picker or drag-and-drop. Input originals are preserved; selected resolution may not be supported by every codec.
- Settings and completed download history are stored under Electron's per-user application data directory. Passwords, cookies and access tokens are not collected.
- Pause/resume, speed/ETA for sources without measurable lengths, retry, and platform API integrations are not implemented in this initial release; controls are not presented as working features.

## Manual smoke test

1. Launch `npm run electron:dev`; confirm all seven navigation sections and both themes render.
2. Download a publicly hosted direct `.mp4`/`.mp3` media URL to a chosen folder. Confirm progress (where reported), cancellation, completed file opening and history persistence after restart.
3. Try a YouTube URL; confirm the app explains that an authorized provider is unavailable and starts no transfer.
4. With FFmpeg/FFprobe on PATH, import a local media file, inspect its metadata, convert it to a different format and open the output. Confirm the input file remains unchanged.
5. Use an invalid URL and a localhost URL; confirm validation errors. Check that failed downloads leave no `.part` file.

## Security and distribution

Electron uses context isolation, disabled renderer Node integration, sandboxing, a narrow preload API, CSP, navigation blocking and IPC validation. Remote URLs must use HTTP(S) and private/local hosts are rejected. Installer signing is not configured; sign the final installer with your organization's trusted Windows code-signing certificate before broad distribution. `build/icon.ico` is reserved for the brand icon; replace it with an owned Windows ICO before publishing.

## Development notes

Settings are Zod-validated in the main process. Direct downloads stream to a temporary `.part` file, then atomically rename on success. Conversion output is written separately from the input. Review `electron/main.ts` and `electron/preload.ts` before adding IPC operations.

