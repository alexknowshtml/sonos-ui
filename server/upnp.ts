// UPnP SOAP control and GENA subscription management for Sonos speakers
import { updateRoomVolume } from "./db";

type BroadcastFn = (data: object) => void;
type RoomsCacheFn = () => { data: any[] } | null;

let localIP = "127.0.0.1";
let serverPort = 2650;
let broadcast: BroadcastFn = () => {};
let getRoomsCache: RoomsCacheFn = () => null;

const subscriptions = new Map<string, string>(); // SID → IP
const subscribedIPs = new Set<string>();

export function initUpnp(
  port: number,
  ip: string,
  broadcastFn: BroadcastFn,
  roomsCacheFn: RoomsCacheFn
) {
  serverPort = port;
  localIP = ip;
  broadcast = broadcastFn;
  getRoomsCache = roomsCacheFn;
}

export async function subscribeToRoom(ip: string): Promise<void> {
  if (subscribedIPs.has(ip)) return;
  try {
    const res = await fetch(`http://${ip}:1400/MediaRenderer/RenderingControl/Event`, {
      method: "SUBSCRIBE",
      headers: {
        CALLBACK: `<http://${localIP}:${serverPort}/upnp/notify/${ip}>`,
        NT: "upnp:event",
        TIMEOUT: "Second-1800",
      },
      signal: AbortSignal.timeout(4000),
    });
    const sid = res.headers.get("SID");
    if (sid) {
      subscriptions.set(sid, ip);
      subscribedIPs.add(ip);
      setTimeout(() => renewSubscription(ip, sid), 1700 * 1000);
    }
  } catch {}
}

async function renewSubscription(ip: string, sid: string): Promise<void> {
  try {
    await fetch(`http://${ip}:1400/MediaRenderer/RenderingControl/Event`, {
      method: "SUBSCRIBE",
      headers: { SID: sid, TIMEOUT: "Second-1800" },
      signal: AbortSignal.timeout(4000),
    });
    setTimeout(() => renewSubscription(ip, sid), 1700 * 1000);
  } catch {
    subscribedIPs.delete(ip);
    subscriptions.delete(sid);
    setTimeout(() => subscribeToRoom(ip), 5000);
  }
}

export function parseLastChange(xmlBody: string): { volume?: number; mute?: boolean } {
  const lcMatch = xmlBody.match(/<LastChange>([\s\S]*?)<\/LastChange>/);
  if (!lcMatch) return {};
  const lc = lcMatch[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const volMatch = lc.match(/<Volume[^>]+channel="Master"[^>]+val="(\d+)"/);
  const muteMatch = lc.match(/<Mute[^>]+channel="Master"[^>]+val="([01])"/);
  return {
    volume: volMatch ? parseInt(volMatch[1]) : undefined,
    mute: muteMatch ? muteMatch[1] === "1" : undefined,
  };
}

export function handleNotify(ip: string, xmlBody: string): void {
  const { volume, mute } = parseLastChange(xmlBody);
  if (volume !== undefined || mute !== undefined) {
    updateRoomVolume(ip, volume, mute);
    const cache = getRoomsCache();
    if (cache && Array.isArray(cache.data)) {
      const room = cache.data.find((r: any) => r.ip === ip);
      if (room) {
        if (volume !== undefined) room.volume = volume;
        if (mute !== undefined) room.muted = mute;
        broadcast({ type: "volume", room: room.name, volume, mute });
      }
    }
  }
}

function upnpSoap(ip: string, action: string, args: string) {
  return fetch(`http://${ip}:1400/MediaRenderer/RenderingControl/Control`, {
    method: "POST",
    headers: {
      "Content-Type": 'text/xml; charset="utf-8"',
      SOAPAction: `"urn:schemas-upnp-org:service:RenderingControl:1#${action}"`,
    },
    body: `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action} xmlns:u="urn:schemas-upnp-org:service:RenderingControl:1">${args}</u:${action}></s:Body></s:Envelope>`,
    signal: AbortSignal.timeout(3000),
  }).then((r) => r.text());
}

export async function getRoomVolume(ip: string): Promise<number> {
  const xml = await upnpSoap(ip, "GetVolume", "<InstanceID>0</InstanceID><Channel>Master</Channel>");
  const m = xml.match(/<CurrentVolume>(\d+)<\/CurrentVolume>/);
  return m ? parseInt(m[1]) : 0;
}

export async function getRoomMute(ip: string): Promise<boolean> {
  const xml = await upnpSoap(ip, "GetMute", "<InstanceID>0</InstanceID><Channel>Master</Channel>");
  const m = xml.match(/<CurrentMute>([01])<\/CurrentMute>/);
  return m ? m[1] === "1" : false;
}

export async function setRoomVolume(ip: string, level: number): Promise<void> {
  await upnpSoap(ip, "SetVolume", `<InstanceID>0</InstanceID><Channel>Master</Channel><DesiredVolume>${level}</DesiredVolume>`);
}

export async function setRoomMute(ip: string, muted: boolean): Promise<void> {
  await upnpSoap(ip, "SetMute", `<InstanceID>0</InstanceID><Channel>Master</Channel><DesiredMute>${muted ? "1" : "0"}</DesiredMute>`);
}
