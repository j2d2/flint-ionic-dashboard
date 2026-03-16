/**
 * vaultReader.ts — read-only vault file access for frontmatter preview.
 *
 * Reads vault markdown files from VAULT_PATH and parses YAML frontmatter.
 * Direct filesystem access is allowed here because:
 *   1. Read-only — this service never writes.
 *   2. No Flint MCP tool covers arbitrary vault file reads yet.
 * If `read_vault_doc(path)` is added to Flint later, migrate to callTool.
 */
import fs from 'fs';
import path from 'path';

const VAULT_PATH = process.env.VAULT_PATH ?? '';

function vaultRoot(): string {
  if (!VAULT_PATH) throw new Error('VAULT_PATH not set in .env');
  return VAULT_PATH;
}

/**
 * Parse YAML frontmatter between the first pair of `---` delimiters.
 * Returns {} if the file has no frontmatter or is not readable.
 */
export function readFrontmatter(vaultRelativePath: string): Record<string, unknown> {
  if (!vaultRelativePath) return {};

  const fullPath = path.resolve(vaultRoot(), vaultRelativePath);

  // Security: ensure the resolved path is within the vault root
  const root = path.resolve(vaultRoot());
  if (!fullPath.startsWith(root + path.sep) && fullPath !== root) {
    console.warn(`vaultReader: path escapes vault root: ${vaultRelativePath}`);
    return {};
  }

  let content: string;
  try {
    content = fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return {};
  }

  // Extract text between first two `---` lines
  const lines = content.split('\n');
  if (lines[0]?.trim() !== '---') return {};

  const closingIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (closingIdx === -1) return {};

  const fmLines = lines.slice(1, closingIdx);
  return parseYamlFrontmatter(fmLines);
}

/**
 * Minimal YAML parser for frontmatter — handles scalar values, lists, and
 * quoted strings without pulling in a full yaml dependency at runtime.
 * For complex nested structures, consider adding js-yaml.
 */
function parseYamlFrontmatter(lines: string[]): Record<string, unknown> {
  // Use js-yaml if available (it's in package.json)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const yaml = require('js-yaml') as { load: (s: string) => unknown };
    const result = yaml.load(lines.join('\n'));
    return (result && typeof result === 'object') ? result as Record<string, unknown> : {};
  } catch {
    // Fallback: line-by-line key: value parsing
    const result: Record<string, unknown> = {};
    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const raw = line.slice(colonIdx + 1).trim();
      if (!key) continue;
      // Unquote strings
      if ((raw.startsWith('"') && raw.endsWith('"')) ||
          (raw.startsWith("'") && raw.endsWith("'"))) {
        result[key] = raw.slice(1, -1);
      } else if (raw === 'true') {
        result[key] = true;
      } else if (raw === 'false') {
        result[key] = false;
      } else if (!isNaN(Number(raw)) && raw !== '') {
        result[key] = Number(raw);
      } else {
        result[key] = raw;
      }
    }
    return result;
  }
}

/**
 * Patch the ## Output section of a vault doc with the provided markdown.
 * Replaces the "_Awaiting processing._" placeholder, or the whole ## Output body,
 * or appends a new ## Output section if none exists.
 * Returns true on success.
 */
export function patchVaultOutput(vaultRelativePath: string, outputMarkdown: string): boolean {
  if (!vaultRelativePath) return false;
  const fullPath = path.resolve(vaultRoot(), vaultRelativePath);
  const root = path.resolve(vaultRoot());
  if (!fullPath.startsWith(root + path.sep)) return false;

  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    const placeholder = '_Awaiting processing._';
    let updated: string;
    if (content.includes(placeholder)) {
      updated = content.replace(placeholder, outputMarkdown.trim());
    } else if (content.includes('\n## Output\n')) {
      updated = content.replace(/\n## Output\n[\s\S]*$/, `\n## Output\n\n${outputMarkdown.trim()}\n`);
    } else {
      updated = content.trimEnd() + `\n\n## Output\n\n${outputMarkdown.trim()}\n`;
    }
    fs.writeFileSync(fullPath, updated, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Read the full markdown content of a vault doc (body only, frontmatter stripped).
 * Returns null if file not found or path escapes vault root.
 */
export function readVaultDocBody(vaultRelativePath: string): string | null {
  if (!vaultRelativePath) return null;

  const fullPath = path.resolve(vaultRoot(), vaultRelativePath);
  const root = path.resolve(vaultRoot());
  if (!fullPath.startsWith(root + path.sep)) return null;

  let content: string;
  try {
    content = fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }

  // Strip frontmatter
  const lines = content.split('\n');
  if (lines[0]?.trim() === '---') {
    const closingIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
    if (closingIdx !== -1) {
      return lines.slice(closingIdx + 1).join('\n').trimStart();
    }
  }
  return content;
}
