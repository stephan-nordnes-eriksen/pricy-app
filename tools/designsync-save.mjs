// PostToolUse hook: auto-write DesignSync get_file results to proto/.
// Keeps sync byte-faithful (no model retyping) and halves sync context cost.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8'));
if (input.tool_name !== 'DesignSync') process.exit(0);
const ti = input.tool_input || {};
if (ti.method !== 'get_file' || !String(ti.path || '').startsWith('pricy/')) process.exit(0);

let r = input.tool_response;
// Unwrap the shapes the harness may hand us: JSON string, {output}, or MCP-style content blocks.
if (typeof r === 'string') { try { r = JSON.parse(r); } catch { process.exit(0); } }
if (r && typeof r.output === 'string') { try { r = JSON.parse(r.output); } catch {} }
if (r && Array.isArray(r.content) && r.content[0] && typeof r.content[0].text === 'string') {
  try { r = JSON.parse(r.content[0].text); } catch {}
}
if (!r || typeof r.content !== 'string' || r.truncated) process.exit(0);

const rel = ti.path.slice('pricy/'.length);
const dest = join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), 'proto', rel);
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, r.isBase64 ? Buffer.from(r.content, 'base64') : r.content);
console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PostToolUse',
    additionalContext: `proto/${rel} already written to disk byte-faithfully by the DesignSync hook — do NOT re-write it, just \`git diff proto/${rel}\`.`,
  },
}));
