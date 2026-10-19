import { app, BrowserWindow, ipcMain, dialog, shell, Notification } from 'electron';
import { join, resolve, extname, isAbsolute, basename } from 'node:path';
import { mkdir, writeFile, readFile, rename, unlink, stat, realpath } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { spawn, ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns';
import { Agent } from 'undici';
import electronUpdater from 'electron-updater';
import { SettingsSchema, DEFAULT_SETTINGS } from './services/storage/settings';
import { validateRemoteUrl, isPrivateAddress } from './security/url-validation';

let win: BrowserWindow | null = null;
const downloads = new Map<string, AbortController>();
const downloadJobs = new Map<string, () => Promise<void>>();
const downloadQueue: string[] = [];
let activeDownloads = 0;
let maxConcurrentDownloads = DEFAULT_SETTINGS.maxConcurrent;
const conversions = new Map<string, ChildProcess>();
const { autoUpdater } = electronUpdater;
let updateDownloaded = false;
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
const settingsPath = () => join(app.getPath('userData'), 'settings.json');
const historyPath = () => join(app.getPath('userData'), 'history.json');
const mediaExtensions = new Set(['.mp4','.mkv','.mov','.webm','.avi','.mp3','.wav','.aac','.m4a','.flac','.ogg']);
async function localMediaFile(value: unknown) { if (typeof value !== 'string' || !isAbsolute(value)) throw new Error('Choose a local media file.'); const path = await realpath(value); if (!mediaExtensions.has(extname(path).toLowerCase()) || !(await stat(path)).isFile()) throw new Error('That file type is not supported.'); return path; }
async function loadJson<T>(path: string, fallback: T): Promise<T> { try { return JSON.parse(await readFile(path, 'utf8')) as T; } catch { return fallback; } }
async function saveJson(path: string, value: unknown) { await mkdir(app.getPath('userData'), { recursive: true }); const temp = `${path}.tmp`; await writeFile(temp, JSON.stringify(value, null, 2)); await rename(temp, path); }
function send(channel: string, data: unknown) { win?.webContents.send(channel, data); }
function updateStatus(status: string, details: Record<string, unknown> = {}) { send('updates:state', { status, ...details }); }
function updateNotification(title: string, body: string) { if (!Notification.isSupported()) return; void loadJson(settingsPath(), DEFAULT_SETTINGS).then(raw => { const prefs = SettingsSchema.parse({ ...DEFAULT_SETTINGS, ...raw }); if (prefs.notifications) new Notification({ title, body }).show(); }).catch(() => {}); }
async function checkForUpdates() {
  if (!app.isPackaged) return { status: 'unsupported', message: 'Update checks are available in the installed app.' };
  if (process.env.PORTABLE_EXECUTABLE_DIR) return { status: 'unsupported', message: 'Portable builds do not update in place. Install the setup version to receive updates.' };
  try { updateStatus('checking', { message: 'Checking GitHub Releases…' }); void autoUpdater.checkForUpdates().catch(() => {}); return { status: 'checking', message: 'Checking GitHub Releases…' }; }
  catch { updateStatus('error', { message: 'Could not check GitHub Releases. Try again later.' }); return { status: 'error', message: 'Could not check GitHub Releases. Try again later.' }; }
}
function configureUpdaterEvents() {
  autoUpdater.on('checking-for-update', () => updateStatus('checking', { message: 'Checking GitHub Releases…' }));
  autoUpdater.on('update-available', info => { updateStatus('available', { version: info.version, message: `Version ${info.version} is available. Downloading in the background…` }); updateNotification('Bayon Downloader update', `Version ${info.version} is available and downloading.`); });
  autoUpdater.on('update-not-available', info => updateStatus('current', { version: info.version, message: `Bayon Downloader ${info.version} is up to date.` }));
  autoUpdater.on('download-progress', progress => updateStatus('downloading', { percent: Math.round(progress.percent), message: `Downloading update · ${Math.round(progress.percent)}%` }));
  autoUpdater.on('update-downloaded', info => { updateDownloaded = true; updateStatus('downloaded', { version: info.version, message: `Version ${info.version} is ready to install. Restart Bayon to finish.` }); updateNotification('Bayon Downloader update ready', `Version ${info.version} will install when Bayon restarts.`); });
  autoUpdater.on('error', () => updateStatus('error', { message: 'Could not check or download an update. Check your connection and try again.' }));
}
function secureLookup(hostname: string, options: any, callback: any) { dnsLookup(hostname, { all: true, verbatim: true }, (error, addresses) => { if (error) return callback(error, null); if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) return callback(new Error('The host resolved to a local or private address.'), null); if (options?.all) return callback(null, addresses); const first = addresses[0]; callback(null, first.address, first.family); }); }
function launchQueuedDownloads() { while (activeDownloads < maxConcurrentDownloads && downloadQueue.length) { const id = downloadQueue.shift()!; const job = downloadJobs.get(id); if (!job) continue; activeDownloads++; void job().finally(() => { activeDownloads--; downloadJobs.delete(id); launchQueuedDownloads(); }); } }
function registerIpc() {
  ipcMain.handle('settings:get', async () => { const parsed = SettingsSchema.parse({ ...DEFAULT_SETTINGS, ...await loadJson(settingsPath(), {}) }); maxConcurrentDownloads = parsed.maxConcurrent; return parsed; });
  ipcMain.handle('settings:set', async (_e, candidate) => { const parsed = SettingsSchema.parse(candidate); await saveJson(settingsPath(), parsed); maxConcurrentDownloads = parsed.maxConcurrent; app.setLoginItemSettings({ openAtLogin: parsed.launchAtStartup }); launchQueuedDownloads(); return parsed; });
  ipcMain.handle('files:pick-folder', async () => { const result = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'createDirectory'] }); return result.canceled ? null : result.filePaths[0]; });
  ipcMain.handle('files:pick-media', async () => { const result = await dialog.showOpenDialog(win!, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Media', extensions: ['mp4','mkv','mov','webm','avi','mp3','wav','aac','m4a','flac','ogg'] }] }); return result.canceled ? [] : result.filePaths; });
  ipcMain.handle('files:open', async (_e, file: string) => shell.openPath(await localMediaFile(file)));
  ipcMain.handle('files:reveal', async (_e, file: string) => shell.showItemInFolder(await localMediaFile(file)));
  ipcMain.handle('downloads:history', async () => loadJson(historyPath(), []));
  ipcMain.handle('downloads:remove', async (_e, id: string) => { const h = await loadJson<any[]>(historyPath(), []); await saveJson(historyPath(), h.filter(x => x.id !== id)); });
  ipcMain.handle('downloads:start', async (_e, input) => {
    if (!input || typeof input.url !== 'string') throw new Error('Enter a media URL.');
    const url = await validateRemoteUrl(input.url);
    const host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be' || host === 'tiktok.com' || host.endsWith('.tiktok.com') || host === 'facebook.com' || host.endsWith('.facebook.com') || host === 'fb.watch') throw new Error('This platform provider is not configured. Only authorized integrations are supported.');
    if (!/^https?:$/.test(new URL(url).protocol)) throw new Error('Only HTTP and HTTPS media links are supported.');
    const id = randomUUID(); const controller = new AbortController(); downloads.set(id, controller);
    const dest = input?.directory; if (typeof dest !== 'string' || !isAbsolute(dest) || dest.length > 2048) throw new Error('Choose a valid destination folder.');
    const name = sanitizeName(input.filename || decodeURIComponent(new URL(url).pathname.split('/').pop() || 'download.media'));
    const target = join(dest, name); if (!target.startsWith(dest)) throw new Error('Invalid output path.');
    downloadJobs.set(id, async () => {
      const start = Date.now();
      const dispatcher = new Agent({ connect: { lookup: secureLookup } });
      try {
        await mkdir(dest, { recursive: true });
        send('downloads:started', { id });
        const response = await fetch(url, { signal: controller.signal, redirect: 'error', dispatcher } as RequestInit & { dispatcher: Agent });
        if (!response.ok || !response.body) throw new Error(`Source returned HTTP ${response.status}.`);
        const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (!(contentType.startsWith('video/') || contentType.startsWith('audio/') || contentType === 'application/octet-stream')) throw new Error('The source did not return a direct media file.');
        const total = Number(response.headers.get('content-length')) || 0; let received = 0;
        const reader = response.body.getReader(); const out = createWriteStream(`${target}.part`);
        try { while (true) { const { done, value } = await reader.read(); if (done) break; if (controller.signal.aborted) throw new Error('Cancelled'); received += value.byteLength; if (!out.write(Buffer.from(value))) await new Promise<void>(resolve => out.once('drain', resolve)); send('downloads:progress', { id, received, total, percent: total ? received / total * 100 : null, speed: received / Math.max(.1, (Date.now()-start)/1000) }); } } finally { out.end(); await new Promise<void>(resolve => out.once('close', resolve)); }
        await dispatcher.close(); await rename(`${target}.part`, target); const record = { id, filename: name, path: target, status: 'completed', size: received, finishedAt: Date.now() }; const hist = await loadJson<any[]>(historyPath(), []); hist.unshift(record); await saveJson(historyPath(), hist); send('downloads:complete', record);
      } catch (error) { try { await dispatcher.destroy(); } catch {} try { await unlink(`${target}.part`); } catch {} send(controller.signal.aborted ? 'downloads:cancelled' : 'downloads:error', { id, message: error instanceof Error ? error.message : 'Download failed.' }); }
      finally { downloads.delete(id); }
    }); const queued = activeDownloads >= maxConcurrentDownloads; downloadQueue.push(id); launchQueuedDownloads(); return { id, filename: name, status: queued ? 'queued' : 'preparing' };
  });
  ipcMain.handle('downloads:cancel', (_e, id: string) => { const queuedIndex = downloadQueue.indexOf(id); if (queuedIndex >= 0) { downloadQueue.splice(queuedIndex, 1); downloadJobs.delete(id); downloads.delete(id); send('downloads:cancelled', { id }); } else downloads.get(id)?.abort(); });
  ipcMain.handle('media:inspect', async (_e, path: string) => runMediaTool('ffprobe', ['-v','error','-show_entries','format=duration,size:stream=codec_name,width,height,codec_type','-of','json',await localMediaFile(path)]));
  ipcMain.handle('media:convert', async (_e, input) => {
    if (!input || !['mp4','mkv','mov','webm','avi','mp3','wav','aac'].includes(input.format)) throw new Error('Unsupported output format.');
    const source = await localMediaFile(input.source); if (typeof input.directory !== 'string' || !isAbsolute(input.directory)) throw new Error('Choose a valid output folder.');
    const destination = await realpath(input.directory); if (!(await stat(destination)).isDirectory()) throw new Error('Choose a valid output folder.');
    const id = randomUUID(); const stem = sanitizeName(input.name || basename(source)).replace(/\.[^.]+$/, ''); const out = resolve(destination, `${stem}.${input.format}`);
    if (out === source) throw new Error('Choose a different output format or folder to preserve the original.');
    const args = ['-nostdin','-n','-i',source]; if (input.height && input.height !== 'original') { const h = Number(input.height); if (![360,480,720,1080,1440,2160].includes(h)) throw new Error('Unsupported resolution.'); args.push('-vf',`scale=-2:${h}`); } args.push(out);
    const child = spawn(resolveBinary('ffmpeg'), args, { windowsHide: true }); conversions.set(id, child); let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-6000); const match = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(chunk.toString()); if (match) send('media:progress', { id, time: Number(match[1])*3600+Number(match[2])*60+Number(match[3]) }); });
    child.on('close', code => { conversions.delete(id); if (code === 0) send('media:complete', { id, path: out }); else send('media:error', { id, message: stderr || `FFmpeg exited with code ${code}.` }); });
    child.on('error', e => { conversions.delete(id); send('media:error', { id, message: `Could not start FFmpeg: ${e.message}` }); }); return { id, path: out };
  });
  ipcMain.handle('media:cancel', (_e, id: string) => { conversions.get(id)?.kill('SIGTERM'); });
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('app:update-check', () => checkForUpdates());
  ipcMain.handle('app:update-install', () => { if (!updateDownloaded) throw new Error('No downloaded update is ready to install.'); autoUpdater.quitAndInstall(false, true); });
  ipcMain.handle('app:notify', async (_e, title: string, body: string) => { const prefs = SettingsSchema.parse({ ...DEFAULT_SETTINGS, ...await loadJson(settingsPath(), {}) }); if (prefs.notifications && Notification.isSupported()) new Notification({ title: String(title).slice(0,80), body: String(body).slice(0,180) }).show(); });
}
function sanitizeName(name: string) { return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/^\.+/, '').slice(0,180) || 'media'; }
function resolveBinary(name: string) { return name; }
function runMediaTool(binary: string, args: string[]) { return new Promise((resolve, reject) => { const p = spawn(resolveBinary(binary), args, { windowsHide: true }); let stdout=''; let stderr=''; p.stdout?.on('data', x => stdout += x); p.stderr?.on('data', x => stderr += x); p.on('error', e => reject(new Error(`${binary} unavailable. Install FFmpeg and ensure ffprobe is on PATH. ${e.message}`))); p.on('close', code => code === 0 ? resolve(JSON.parse(stdout)) : reject(new Error(stderr || `${binary} exited with code ${code}`))); }); }
app.whenReady().then(async () => { const prefs = SettingsSchema.parse({ ...DEFAULT_SETTINGS, ...await loadJson(settingsPath(), {}) }); maxConcurrentDownloads = prefs.maxConcurrent; app.setLoginItemSettings({ openAtLogin: prefs.launchAtStartup }); configureUpdaterEvents(); registerIpc(); win = new BrowserWindow({ width: 1440, height: 920, minWidth: 900, minHeight: 650, backgroundColor: '#0B1120', icon: join(__dirname,'../dist/bayon-mark.ico'), webPreferences: { preload: join(__dirname,'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } }); win.webContents.setWindowOpenHandler(() => ({ action: 'deny' })); win.webContents.on('will-navigate', (e, url) => { if (process.env.VITE_DEV_SERVER_URL && url.startsWith(process.env.VITE_DEV_SERVER_URL)) return; e.preventDefault(); }); if (process.env.VITE_DEV_SERVER_URL) void win.loadURL(process.env.VITE_DEV_SERVER_URL); else void win.loadFile(join(__dirname,'../dist/index.html')); });
app.on('before-quit', () => { for (const c of downloads.values()) c.abort(); for (const p of conversions.values()) p.kill('SIGTERM'); });
