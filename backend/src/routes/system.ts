/**
 * routes/system.ts — machine info for the Home (device info) page.
 * Read-only. Uses Node.js `os` module — no external dependencies.
 */
import { Router, Request, Response } from 'express';
import os from 'os';

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
