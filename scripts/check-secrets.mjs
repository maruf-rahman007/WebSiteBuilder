#!/usr/bin/env node
/**
 * Fails if any file git would commit contains something that looks like a
 * credential, or if a real env file is about to be committed. Runs as a
 * pre-commit hook (.githooks/pre-commit) and in CI.
 *
 *   node scripts/check-secrets.mjs           # tracked + untracked, non-ignored files
 *   node scripts/check-secrets.mjs --staged  # only staged files (pre-commit)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const PATTERNS = [
  ['OpenRouter API key', /sk-or-v1-[a-f0-9]{32,}/],
  ['Anthropic API key', /sk-ant-[A-Za-z0-9_-]{20,}/],
  ['OpenAI API key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/],
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{60,}/],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['Stripe secret key', /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}/],
  ['Private key block', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/],
  // KEY=value / "secret": "value" style assignments with a non-empty value.
  [
    'Hardcoded secret assignment',
    /\b[A-Z0-9_]*(?:API_KEY|SECRET|TOKEN|PASSWORD)\s*=\s*['"]?[A-Za-z0-9_\-/.+]{16,}/,
  ],
];

const FORBIDDEN_FILE =
  /(^|\/)\.env(\.(?!example$)[^/]+)?$|\.(pem|key|p12|pfx)$|(^|\/)id_(rsa|ed25519)$/;
const SKIP_CONTENT = /(^|\/)package-lock\.json$|\.(png|jpe?g|gif|webp|ico|woff2?|ttf|zip)$/;
const MAX_BYTES = 2_000_000;

const staged = process.argv.includes('--staged');
const git = (args) => execFileSync('git', args, { encoding: 'utf8' }).split('\0').filter(Boolean);
const files = staged
  ? git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'])
  : git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']);

const problems = [];
for (const file of files) {
  if (FORBIDDEN_FILE.test(file)) {
    problems.push(`${file}: env/key files must never be committed`);
    continue;
  }
  if (SKIP_CONTENT.test(file)) continue;
  let content;
  try {
    if (statSync(file).size > MAX_BYTES) continue;
    content = staged
      ? execFileSync('git', ['show', `:${file}`], { encoding: 'utf8' })
      : readFileSync(file, 'utf8');
  } catch {
    continue; // deleted or unreadable
  }
  content.split('\n').forEach((line, index) => {
    for (const [name, pattern] of PATTERNS) {
      if (pattern.test(line)) problems.push(`${file}:${index + 1}: possible ${name}`);
    }
  });
}

if (problems.length > 0) {
  console.error(`✖ Secret scan failed (${problems.length} finding(s)). Values are not printed.\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(
    '\nMove secrets to an ignored .env file. If this is a false positive, adjust scripts/check-secrets.mjs.',
  );
  process.exit(1);
}
console.log(`✔ Secret scan passed (${files.length} files checked)`);
