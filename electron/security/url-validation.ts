import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
export function isPrivateAddress(address:string) {
  const value=address.toLowerCase().replace(/^\[|\]$/g,'');
  if(value.includes(':')) {
    const mapped=value.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if(mapped)return isPrivateAddress(mapped[1]);
    return value==='::'||value==='::1'||/^f[cd]/.test(value)||/^fe[89ab]/.test(value)||/^ff/.test(value);
  }
  const parts=value.split('.').map(Number); if(parts.length!==4||parts.some(n=>!Number.isInteger(n)||n<0||n>255))return true;
  const [a,b]=parts;
  return a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===100&&b>=64&&b<=127)||(a===192&&b===0)||(a===198&&(b===18||b===19));
}
export async function validateRemoteUrl(value: unknown): Promise<string> {
  if (typeof value !== 'string' || value.length > 4096) throw new Error('Enter a valid media URL.');
  let url: URL; try { url = new URL(value); } catch { throw new Error('That URL is not valid.'); }
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw new Error('Only public HTTP or HTTPS URLs are supported.');
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g,'');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || isIP(host) && isPrivateAddress(host)) throw new Error('Local and private network addresses are not allowed.');
  const resolved = await lookup(host, { all: true }).catch(() => []);
  for (const { address } of resolved) if (isPrivateAddress(address)) throw new Error('This host resolves to a private network address.');
  return url.toString();
}
