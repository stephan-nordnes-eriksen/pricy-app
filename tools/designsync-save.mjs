// PostToolUse hook: auto-write DesignSync get_file results to proto/.
// Keeps sync byte-faithful (no model retyping) and, via updatedToolOutput,
// keeps fetched file contents out of model context entirely.
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
const rel = ti.path.slice('pricy/'.length);
// Replace the tool result so file contents never enter model context.
// updatedToolOutput must match the tool's output shape, so keep the envelope
// and swap only `content` for a short receipt.
const reply = (msg) => {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      updatedToolOutput: { ...r, content: msg, isBase64: false },
    },
  }));
  process.exit(0);
};
if (!r || typeof r.content !== 'string') process.exit(0);
if (r.truncated) reply(`pricy/${rel}: truncated:true — exceeds the get_file cap. NOT written. Split the file further upstream; never splice.`);

const dest = join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), 'proto', rel);
mkdirSync(dirname(dest), { recursive: true });
const buf = r.isBase64 ? Buffer.from(r.content, 'base64') : Buffer.from(r.content);
writeFileSync(dest, buf);
reply(`proto/${rel} written byte-faithfully by the DesignSync hook (${buf.length} bytes; content withheld from context). Do NOT re-write it — just \`git diff proto/${rel}\`.`);
