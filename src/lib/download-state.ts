export type DownloadStatus='queued'|'preparing'|'downloading'|'paused'|'completed'|'cancelled'|'failed';
const transitions:Record<DownloadStatus,readonly DownloadStatus[]>={queued:['preparing','cancelled'],preparing:['downloading','completed','cancelled','failed'],downloading:['completed','cancelled','failed'],paused:['downloading','cancelled','failed'],completed:[],cancelled:['queued'],failed:['queued']};
export function canTransitionDownload(from:DownloadStatus,to:DownloadStatus){return transitions[from].includes(to)}
export function transitionDownload(from:DownloadStatus,to:DownloadStatus){if(!canTransitionDownload(from,to))throw new Error(`Invalid download transition: ${from} → ${to}`);return to}
