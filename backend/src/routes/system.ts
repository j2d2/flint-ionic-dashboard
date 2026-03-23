/**
 * routes/system.ts — machine info for the Home (device info) page.
 * Read-only. Uses Node.js `os` module — no external dependencies.
 */
import { Router, Request, Response } from 'express';
import { exec } from 'child_process';
import { readFile } from 'fs/promises';
import { promisify } from 'util';
import os from 'os';
import path from 'path';

const execAsync = promisify(exec);

export const systemRouter = Router();

const TIER = process.env.HARDWARE_TIER ?? 'MAC_DEV';

const TIER_LABELS: Record<string, string> = {
  MAC_DEV:  'MacBook Development (16 GB)',
  STANDARD: 'Minisforum UM890 Pro (32 GB)',
  APEX:     'GMKtec EVO-X2 (96 GB)',
  EDGE:     'Beelink N100 (16 GB)',
};

systemRouter.get('/', (_req: Request, res: Response) => {
  const cpus = os.cpus();
  res.json({
    tier: TIER,
    tier_label: TIER_LABELS[TIER] ?? TIER,
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    cpu_cores: cpus.length,
    cpu_model: cpus[0]?.model ?? 'unknown',
    total_mem_gb: Math.round(os.totalmem() / 1024 ** 3),
    free_mem_gb: Math.round(os.freemem() / 1024 ** 3),
    uptime_h: Math.round(os.uptime() / 3600),
    node_version: process.version,
    flint_url: process.env.FLINT_MCP_URL ?? 'http://127.0.0.1:18765/mcp',
    vault_path: process.env.VAULT_PATH ?? '(not set)',
  });
});

// GET /api/system/stats — RAM and network usage for persistent stats bar
systemRouter.get('/stats', async (_req: Request, res: Response) => {
  try {
    const ram_total_gb = os.totalmem() / 1024 ** 3;
    const ram_used_gb = (os.totalmem() - os.freemem()) / 1024 ** 3;
    let rx_bytes = 0;
    let tx_bytes = 0;

    // macOS: use netstat -ib, find Ibytes/Obytes columns by header name
    if (process.platform === 'darwin') {
      const { stdout } = await execAsync('netstat -ib');
      const lines = stdout.split('\n');
      // Find header line to get reliable column indices
      const headerLine = lines.find(l => /\bIbytes\b/.test(l) && /\bObytes\b/.test(l));
      if (headerLine) {
        const headers = headerLine.trim().split(/\s+/);
        const ibCol = headers.indexOf('Ibytes');
        const obCol = headers.indexOf('Obytes');
        for (const line of lines) {
          if (/^en\d+\s/.test(line)) {
            const cols = line.trim().split(/\s+/);
            if (ibCol >= 0 && ibCol < cols.length) {
              const ib = parseInt(cols[ibCol], 10);
              if (!isNaN(ib) && ib > 0) rx_bytes = ib;
            }
            if (obCol >= 0 && obCol < cols.length) {
              const ob = parseInt(cols[obCol], 10);
              if (!isNaN(ob) && ob > 0) tx_bytes = ob;
            }
            if (rx_bytes > 0 || tx_bytes > 0) break;
          }
        }
      }
    } else if (process.platform === 'linux') {
      // Linux: read /proc/net/dev
      const { stdout } = await execAsync('cat /proc/net/dev');
      const lines = stdout.split('\n');
      for (const line of lines) {
        if (/^ *(en|eth|wlan)\w*:/.test(line)) {
          // Format: Inter-|   Receive                                                |  Transmit
          // face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
          const parts = line.split(/:|\s+/).filter(Boolean);
          // parts[1]=rx_bytes, parts[9]=tx_bytes
          const rx = parseInt(parts[1], 10);
          const tx = parseInt(parts[9], 10);
          if (!isNaN(rx)) rx_bytes += rx;
          if (!isNaN(tx)) tx_bytes += tx;
          break;
        }
      }
    }

    // Read Flint API usage sidecar written by query_claude_api.py
    let api_request_count = 0;
    let api_input_tokens = 0;
    let api_output_tokens = 0;
    let api_cost_usd = 0;
    try {
      const sidecar = path.join(os.tmpdir(), 'flint_api_usage.json');
      const raw = await readFile(sidecar, 'utf-8');
      const usage = JSON.parse(raw);
      api_request_count = usage.request_count ?? 0;
      api_input_tokens = usage.total_input_tokens ?? 0;
      api_output_tokens = usage.total_output_tokens ?? 0;
      api_cost_usd = Number((usage.total_cost_usd ?? 0).toFixed(4));
    } catch {
      // Sidecar absent until first Claude API call — silently default to zeros
    }

    res.json({
      ram_used_gb: Number(ram_used_gb.toFixed(2)),
      ram_total_gb: Number(ram_total_gb.toFixed(2)),
      rx_bytes,
      tx_bytes,
      api_request_count,
      api_input_tokens,
      api_output_tokens,
      api_cost_usd,
      timestamp_ms: Date.now(),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
