#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');

const usage = `Usage: snip <command>

  add <url>    Shorten an http(s) URL and print its short URL
  ls           List codes, hit counts, and original URLs
  open <code>  Resolve a code and open its target in your browser
  help         Show this help

SNIP_API sets the backend URL (default: http://localhost:3000).`;

function httpUrl(value, label) {
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url;
  } catch {}
  throw new Error(`${label} must be a valid http(s) URL.`);
}

function clean(value) {
  return String(value).replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ');
}

async function checkResponse(response) {
  if (response.ok) return;
  const body = await response.json().catch(() => null);
  throw new Error(typeof body?.error === 'string'
    ? body.error
    : `Backend returned HTTP ${response.status}.`);
}

function openBrowser(target, platform = process.platform, launch = spawn) {
  const url = httpUrl(target, 'Redirect target').href;
  let command;
  let args;
  const options = { stdio: 'ignore' };
  if (platform === 'win32') {
    command = process.env.ComSpec || 'cmd.exe';
    args = ['/d', '/v:off', '/c', 'start', '""', '"%SNIP_OPEN_URL%"'];
    options.env = { ...process.env, SNIP_OPEN_URL: url };
    options.windowsVerbatimArguments = true;
  } else {
    command = platform === 'darwin' ? 'open' : 'xdg-open';
    args = [url];
  }
  return new Promise((resolve, reject) => {
    const child = launch(command, args, options);
    child.once('error', (error) => reject(new Error(`Cannot open browser: ${error.message}`)));
    child.once('close', (code) => code === 0
      ? resolve()
      : reject(new Error(`Browser launcher exited with ${code ?? 'a signal'}.`)));
  });
}

async function main(args = process.argv.slice(2), launchBrowser = openBrowser) {
  const [command, ...values] = args;
  if (!command || ['help', '--help', '-h'].includes(command)) {
    console.log(usage);
    return;
  }
  if (!['add', 'ls', 'open'].includes(command)) {
    throw new Error(`Unknown command: ${clean(command)}. Run "snip help" for usage.`);
  }
  if (values.length !== (command === 'ls' ? 0 : 1)) {
    throw new Error(`Usage: snip ${command}${command === 'ls' ? '' : command === 'add' ? ' <url>' : ' <code>'}`);
  }
  if (command === 'add') httpUrl(values[0], 'URL');
  if (command === 'open' && !/^[0-9A-Za-z]{6}$/.test(values[0])) {
    throw new Error('Code must contain exactly 6 base62 characters (0-9, A-Z, a-z).');
  }

  const base = httpUrl(process.env.SNIP_API || 'http://localhost:3000', 'SNIP_API');
  const endpoint = new URL(command === 'open' ? `/${values[0]}` : '/api/links', base);
  let response;
  try {
    response = await fetch(endpoint, {
      method: command === 'add' ? 'POST' : 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
      ...(command === 'add' ? {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: values[0].trim() })
      } : {})
    });
  } catch (error) {
    throw new Error(`Cannot reach backend at ${base.origin}: ${error.message}`);
  }

  if (command === 'open') {
    if (response.status === 404) throw new Error(`Unknown code: ${values[0]}.`);
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      await checkResponse(response);
      throw new Error('Backend did not return a redirect.');
    }
    const location = response.headers.get('Location');
    if (!location) throw new Error('Backend redirect is missing a Location header.');
    const target = httpUrl(new URL(location, endpoint), 'Redirect target');
    await launchBrowser(target.href);
    return;
  }

  await checkResponse(response);
  const body = await response.json().catch(() => { throw new Error('Backend returned invalid JSON.'); });
  if (command === 'add') {
    if (typeof body?.shortUrl !== 'string') throw new Error('Backend response is missing shortUrl.');
    httpUrl(body.shortUrl, 'Backend shortUrl');
    console.log(clean(body.shortUrl));
    return;
  }
  if (!Array.isArray(body) || body.some((link) =>
    !link || typeof link.code !== 'string' || typeof link.url !== 'string'
    || !Number.isFinite(link.hits) || link.hits < 0)) {
    throw new Error('Backend returned an invalid links list.');
  }
  if (body.length === 0) {
    console.log('No links yet.');
    return;
  }
  const rows = [['CODE', 'HITS', 'URL'], ...body.map((link) =>
    [clean(link.code), String(link.hits), clean(link.url)])];
  const codeWidth = rows.reduce((width, row) => Math.max(width, row[0].length), 0);
  const hitsWidth = rows.reduce((width, row) => Math.max(width, row[1].length), 0);
  console.log(rows.map(([code, hits, url]) =>
    `${code.padEnd(codeWidth)}  ${hits.padStart(hitsWidth)}  ${url}`).join('\n'));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`snip: ${clean(error.message)}`);
    process.exitCode = 1;
  });
}

module.exports = { main, openBrowser };