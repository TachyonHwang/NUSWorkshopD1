'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');
const { main, openBrowser } = require('./cli.js');

const originalApi = process.env.SNIP_API;
beforeEach(() => { process.env.SNIP_API = 'http://localhost:3000'; });
afterEach(() => {
  if (originalApi === undefined) delete process.env.SNIP_API;
  else process.env.SNIP_API = originalApi;
});

function output(context) {
  const lines = [];
  context.mock.method(console, 'log', (line) => lines.push(line));
  return lines;
}

test('no arguments and help show usage without contacting the backend', async (context) => {
  const lines = output(context);
  context.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected request'); });
  for (const args of [[], ['help'], ['--help'], ['-h']]) await main(args);
  assert.equal(lines.length, 4);
  assert.ok(lines.every((line) => line.startsWith('Usage: snip')));
});

test('add posts JSON to SNIP_API and prints only the returned shortUrl', async (context) => {
  const lines = output(context);
  process.env.SNIP_API = 'https://snip.example/';
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url.href, 'https://snip.example/api/links');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(options.body), { url: 'https://example.com/a?one=1&two=2' });
    return Response.json({ shortUrl: 'https://snip.example/Ab12Cd' }, { status: 201 });
  });
  await main(['add', 'https://example.com/a?one=1&two=2']);
  assert.deepEqual(lines, ['https://snip.example/Ab12Cd']);
});

test('ls prints the exact empty message', async (context) => {
  const lines = output(context);
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url.href, 'http://localhost:3000/api/links');
    assert.equal(options.method, 'GET');
    return Response.json([]);
  });
  await main(['ls']);
  assert.deepEqual(lines, ['No links yet.']);
});

test('ls aligns columns, right-aligns hits, and neutralizes terminal controls', async (context) => {
  const lines = output(context);
  context.mock.method(globalThis, 'fetch', async () => Response.json([
    { code: 'Ab12Cd', hits: 0, url: 'https://example.com/first' },
    { code: 'Zy98Xw', hits: 12345, url: 'https://example.com/second\nline' }
  ]));
  await main(['ls']);
  assert.equal(lines[0], 'CODE     HITS  URL\nAb12Cd      0  https://example.com/first\nZy98Xw  12345  https://example.com/second line');
});

test('open requests only the code with manual redirect and launches Location', async (context) => {
  const lines = output(context);
  let requests = 0;
  let opened;
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    requests += 1;
    assert.equal(url.href, 'http://localhost:3000/Ab12Cd');
    assert.equal(options.redirect, 'manual');
    assert.equal(options.method, 'GET');
    return new Response(null, { status: 302, headers: { Location: 'https://example.com/target?one=1&two=2' } });
  });
  await main(['open', 'Ab12Cd'], async (url) => { opened = url; });
  assert.equal(requests, 1);
  assert.equal(opened, 'https://example.com/target?one=1&two=2');
  assert.deepEqual(lines, []);
});

test('bad input is rejected before fetching', async (context) => {
  context.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected request'); });
  for (const args of [['wrong'], ['add'], ['add', 'https://example.com', 'extra'],
    ['add', 'ftp://example.com'], ['add', 'not-a-url'], ['ls', 'extra'], ['open'], ['open', '../bad']]) {
    await assert.rejects(main(args), /Unknown command|Usage:|valid http\(s\)|base62/);
  }
  process.env.SNIP_API = 'not-a-url';
  await assert.rejects(main(['ls']), /SNIP_API/);
});

test('API errors, unknown codes, and unreachable backend reject clearly', async (context) => {
  const mockedFetch = context.mock.method(globalThis, 'fetch', async () =>
    Response.json({ error: 'URL rejected' }, { status: 400 }));
  await assert.rejects(main(['add', 'https://example.com']), /URL rejected/);
  mockedFetch.mock.mockImplementation(async () => new Response(null, { status: 404 }));
  await assert.rejects(main(['open', 'Ab12Cd']), /Unknown code: Ab12Cd/);
  mockedFetch.mock.mockImplementation(async () => { throw new Error('connection refused'); });
  await assert.rejects(main(['ls']), /Cannot reach backend at http:\/\/localhost:3000/);
});

test('open rejects unsafe or missing Location targets and non-redirect responses', async (context) => {
  const mockedFetch = context.mock.method(globalThis, 'fetch', async () =>
    new Response(null, { status: 302, headers: { Location: 'javascript:alert(1)' } }));
  const neverOpen = async () => { assert.fail('Must not launch browser'); };
  await assert.rejects(main(['open', 'Ab12Cd'], neverOpen), /valid http\(s\)/);
  mockedFetch.mock.mockImplementation(async () => new Response(null, { status: 302 }));
  await assert.rejects(main(['open', 'Ab12Cd'], neverOpen), /missing a Location/);
  mockedFetch.mock.mockImplementation(async () => new Response('static file'));
  await assert.rejects(main(['open', 'Ab12Cd'], neverOpen), /did not return a redirect/);
});

test('browser launchers use start/open/xdg-open without interpolating the target into a shell command', async () => {
  const target = 'https://example.com/a?one=1&two=%22hello%22!';
  for (const platform of ['win32', 'darwin', 'linux']) {
    await openBrowser(target, platform, (command, args, options) => {
      if (platform === 'win32') {
        assert.equal(command, process.env.ComSpec || 'cmd.exe');
        assert.deepEqual(args, ['/d', '/v:off', '/c', 'start', '""', '"%SNIP_OPEN_URL%"']);
        assert.equal(options.env.SNIP_OPEN_URL, target);
        assert.equal(options.windowsVerbatimArguments, true);
      } else {
        assert.equal(command, platform === 'darwin' ? 'open' : 'xdg-open');
        assert.deepEqual(args, [target]);
      }
      const child = new EventEmitter();
      queueMicrotask(() => child.emit('close', 0));
      return child;
    });
  }
});

test('browser launcher failures reject', async () => {
  await assert.rejects(openBrowser('https://example.com', 'linux', () => {
    const child = new EventEmitter();
    queueMicrotask(() => child.emit('error', new Error('missing xdg-open')));
    return child;
  }), /Cannot open browser/);
  await assert.rejects(openBrowser('https://example.com', 'linux', () => {
    const child = new EventEmitter();
    queueMicrotask(() => child.emit('close', 1));
    return child;
  }), /Browser launcher exited with 1/);
});

test('CLI process reports bad input and network failure only on stderr with exit 1', () => {
  for (const args of [['add', 'invalid'], ['ls']]) {
    const child = spawnSync(process.execPath, [join(__dirname, 'cli.js'), ...args], {
      env: { ...process.env, SNIP_API: 'http://127.0.0.1:1' }, encoding: 'utf8'
    });
    assert.equal(child.status, 1);
    assert.equal(child.stdout, '');
    assert.match(child.stderr, /^snip: /);
  }
});