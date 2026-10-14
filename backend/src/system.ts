import si from 'systeminformation';
import { listContainers } from './docker.ts';

interface SysHistory {
  cpu: number[]; mem: number[]; netIn: number[]; netOut: number[]; ts: number[];
}
const history: SysHistory = { cpu: [], mem: [], netIn: [], netOut: [], ts: [] };
const MAX_HIST = 60;
let lastNet = { rx: 0, tx: 0, ts: Date.now() };

export async function getSystem() {
  const [cpu, mem, fs, time, net, temp, containers] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.fsSize(),
    si.time(),
    si.networkStats().catch(() => []),
    si.cpuTemperature().catch(() => ({ main: 0 })),
    listContainers(),
  ]);

  const rootFs = fs.find(f => f.mount === '/') || fs[0];
  const mainNet = net.find(n => n.iface !== 'lo' && (n.iface === 'eth0' || n.iface?.startsWith('en') || n.iface?.startsWith('wl'))) || net.find(n => n.iface !== 'lo') || net[0];

  const now = Date.now();
  history.cpu.push(cpu.currentLoad);
  history.mem.push((mem.active / mem.total) * 100);
  if (mainNet && lastNet.ts) {
    const dt = Math.max(0.5, (now - lastNet.ts) / 1000);
    history.netIn.push(Math.max(0, ((mainNet.rx_bytes || 0) - lastNet.rx) / dt));
    history.netOut.push(Math.max(0, ((mainNet.tx_bytes || 0) - lastNet.tx) / dt));
    lastNet = { rx: mainNet.rx_bytes || 0, tx: mainNet.tx_bytes || 0, ts: now };
  } else {
    history.netIn.push(0); history.netOut.push(0);
  }
  history.ts.push(now);
  while (history.cpu.length > MAX_HIST) {
    history.cpu.shift(); history.mem.shift(); history.netIn.shift(); history.netOut.shift(); history.ts.shift();
  }

  return {
    cpu: { load: Math.round(cpu.currentLoad * 10) / 10, cores: cpu.cpus?.length || 4 },
    mem: {
      total: mem.total, used: mem.active, free: mem.available,
      pct: Math.round((mem.active / mem.total) * 100),
      humanTotal: humanBytes(mem.total), humanUsed: humanBytes(mem.active), humanFree: humanBytes(mem.available),
    },
    disk: rootFs ? {
      size: rootFs.size, used: rootFs.used,
      pct: Math.round((rootFs.use ?? 0) * 10) / 10,
      humanSize: humanBytes(rootFs.size), humanUsed: humanBytes(rootFs.used),
    } : null,
    load: { avg1: cpu.currentLoad, avg5: cpu.avgLoad },
    uptimeSeconds: time.uptime,
    uptimeDays: Math.floor(time.uptime / 86400),
    temp: temp.main || 0,
    net: mainNet ? {
      iface: mainNet.iface,
      rx: history.netIn[history.netIn.length - 1] || 0,
      tx: history.netOut[history.netOut.length - 1] || 0,
      rxTotal: mainNet.rx_bytes || 0, txTotal: mainNet.tx_bytes || 0,
    } : null,
    containers,
    history: { cpu: [...history.cpu], mem: [...history.mem], netIn: [...history.netIn], netOut: [...history.netOut] },
    timestamp: Date.now(),
  };
}

function humanBytes(b: number): string {
  if (b >= 1e12) return `${(b/1e12).toFixed(1)}T`;
  if (b >= 1e9) return `${(b/1e9).toFixed(1)}G`;
  if (b >= 1e6) return `${(b/1e6).toFixed(0)}M`;
  if (b >= 1e3) return `${(b/1e3).toFixed(0)}K`;
  return `${b}B`;
}
