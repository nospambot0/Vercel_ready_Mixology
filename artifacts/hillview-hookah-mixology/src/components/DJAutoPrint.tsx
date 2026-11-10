import { useCallback, useEffect, useRef, useState } from 'react';
import { Bluetooth, Printer, Power, RefreshCw, Unplug } from 'lucide-react';

type Track = { id: string; title: string; requesterName?: string | null; url?: string };
type Device = { name: string; address: string; rssi?: number };
type BridgeStatus = { connected: boolean; protocol_ready: boolean; print_enabled: boolean; message?: string; address?: string | null };

const BRIDGE = 'http://127.0.0.1:8765';
const TOKEN_KEY = 'mixology-printer-bridge-token';
const AUTO_KEY = 'mixology-dj-auto-print-enabled';
const LAST_KEY = 'mixology-dj-auto-print-last-id';

export default function DJAutoPrint({ current, playing }: { current: Track | null; playing: boolean }) {
  const [token, setToken] = useState(() => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } });
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(() => { try { return localStorage.getItem(AUTO_KEY) === '1'; } catch { return false; } });
  const [message, setMessage] = useState('Start Mixology Printer Bridge on this Windows PC.');
  const printedIdRef = useRef<string | null>(null);
  const currentRef = useRef<Track | null>(current);
  currentRef.current = current;

  const request = useCallback(async (path: string, body?: unknown) => {
    if (!token.trim()) throw new Error('Paste the local pairing token from MixologyPrinterBridge.exe.');
    const response = await fetch(BRIDGE + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: 'Bearer ' + token.trim(), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || 'Bridge request failed (' + response.status + ')');
    return data;
  }, [token]);

  const refresh = useCallback(async () => {
    try {
      const data = await request('/v1/status');
      setStatus(data);
      setMessage(data.message || (data.connected ? 'Bluetooth printer connected.' : 'Bridge online; printer disconnected.'));
    } catch (error) {
      setStatus(null);
      setMessage(error instanceof Error ? error.message : 'Cannot reach local printer bridge.');
    }
  }, [request]);

  useEffect(() => { if (token) void refresh(); }, [token, refresh]);

  const scan = async () => {
    setBusy(true);
    try {
      const data = await request('/v1/scan', {});
      setDevices(data.devices || []);
      if (data.devices?.length) setSelected(data.devices[0].address);
      setMessage(data.devices?.length ? 'Found ' + data.devices.length + ' SC03h printer(s).' : 'No SC03h printer found. Turn it on and keep it nearby.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Bluetooth scan failed.'); }
    finally { setBusy(false); }
  };

  const connect = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const data = await request('/v1/connect', { address: selected });
      await refresh();
      setMessage(data.protocol_ready ? 'Printer connected and print protocol ready.' : 'Bluetooth connected. Print protocol is still being verified.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Bluetooth connection failed.'); }
    finally { setBusy(false); }
  };

  const disconnect = async () => {
    setBusy(true);
    try { await request('/v1/disconnect', {}); await refresh(); setMessage('Printer disconnected.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Disconnect failed.'); }
    finally { setBusy(false); }
  };

  const sendTrack = useCallback(async (track: Track) => {
    await request('/v1/print', { track_id: track.id, title: track.title, requester: track.requesterName || 'Guest' });
  }, [request]);

  useEffect(() => {
    if (!enabled || !playing || !current?.id || !status?.connected || !status.print_enabled) return;
    if (printedIdRef.current === current.id) return;
    let last = '';
    try { last = localStorage.getItem(LAST_KEY) || ''; } catch {}
    if (last === current.id) { printedIdRef.current = current.id; return; }
    printedIdRef.current = current.id;
    void sendTrack(current).then(() => {
      try { localStorage.setItem(LAST_KEY, current.id); } catch {}
      setMessage('Track receipt sent to printer.');
    }).catch(error => setMessage(error instanceof Error ? error.message : 'Print failed.'));
  }, [enabled, playing, current?.id, status?.connected, status?.print_enabled, sendTrack]);

  const toggleAuto = () => {
    const next = !enabled;
    setEnabled(next);
    try { localStorage.setItem(AUTO_KEY, next ? '1' : '0'); } catch {}
    if (next) printedIdRef.current = current?.id ?? null;
    setMessage(next ? 'Auto-print armed for the next track, once protocol support is enabled.' : 'Auto-print paused.');
  };

  const saveToken = (value: string) => {
    setToken(value);
    try { localStorage.setItem(TOKEN_KEY, value); } catch {}
  };

  return <section className="mt-5 rounded-2xl border border-secondary/30 bg-secondary/5 p-4" aria-label="Direct Bluetooth thermal printer">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/15 text-secondary"><Bluetooth size={19} /></div><div><p className="text-xs font-black tracking-wide">DIRECT BLUETOOTH PRINTER</p><p className="mt-1 text-[10px] text-muted-foreground">SC03h-3714 · Local Windows bridge</p></div></div>
      <span className={`rounded-full px-3 py-1 text-[10px] font-black ${status?.connected ? 'bg-emerald-600/15 text-emerald-600' : 'bg-secondary/20 text-muted-foreground'}`}>{status?.connected ? 'BLE CONNECTED' : 'NOT CONNECTED'}</span>
    </div>
    <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
      <input value={token} onChange={e => saveToken(e.target.value)} type="password" autoComplete="off" placeholder="Paste pairing token from MixologyPrinterBridge.exe" className="min-w-0 rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-secondary" />
      <button type="button" onClick={() => void refresh()} disabled={busy || !token.trim()} className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-bold disabled:opacity-50"><RefreshCw size={13} /> CHECK BRIDGE</button>
    </div>
    <div className="mt-2 flex flex-wrap gap-2">
      <button type="button" onClick={() => void scan()} disabled={busy || !token.trim()} className="flex min-h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-[10px] font-bold disabled:opacity-50"><Bluetooth size={13} /> SCAN SC03h</button>
      {devices.length > 0 && <select value={selected} onChange={e => setSelected(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-[10px]">{devices.map(d => <option key={d.address} value={d.address}>{d.name} · {d.address}</option>)}</select>}
      {!status?.connected ? <button type="button" onClick={() => void connect()} disabled={busy || !selected} className="min-h-9 rounded-lg bg-secondary px-3 text-[10px] font-black text-secondary-foreground disabled:opacity-50">CONNECT</button> : <button type="button" onClick={() => void disconnect()} disabled={busy} className="flex min-h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-[10px] font-bold"><Unplug size={13} /> DISCONNECT</button>}
    </div>
    <div className="mt-3 rounded-xl border border-border bg-background/70 p-3">
      <p className="text-[10px] leading-5 text-muted-foreground" aria-live="polite">{message}</p>
      <p className="mt-1 text-[10px] font-semibold text-amber-600">{status?.print_enabled ? 'Print protocol ready' : 'BLE link only — print transmission remains locked until the SC03h compressed-image encoder and chunk/ACK protocol are verified.'}</p>
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <span className="text-[10px] text-muted-foreground">Auto-print on track change</span>
      <button type="button" onClick={toggleAuto} disabled={!status?.connected || !status?.print_enabled} className={`flex min-h-9 items-center gap-2 rounded-lg px-3 text-[10px] font-black disabled:opacity-40 ${enabled ? 'bg-emerald-600 text-white' : 'border border-border bg-background'}`}><Power size={13} /> {enabled ? 'AUTO-PRINT ON' : 'AUTO-PRINT OFF'}</button>
    </div>
    <p className="mt-2 text-[10px] text-muted-foreground">Start the bridge on the same Windows PC as this DJ booth. Keep it running while Mixology is open. No browser print dialog is used.</p>
  </section>;
}
