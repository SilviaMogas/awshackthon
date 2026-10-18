import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../src/client/public/index.html', import.meta.url), 'utf8');

test('search and social descriptions identify the simulated prototype', () => {
  for (const attribute of ['name="description"', 'property="og:description"', 'name="twitter:description"']) {
    const value = html.match(new RegExp(`${attribute}\\s+content="([^"]+)"`))[1];
    assert.match(value, /prototype.*simulated/);
    assert.match(value, /not medical advice or an emergency service/);
  }
});

test('canonical and social assets use the documented deployment', () => {
  assert.match(html, /rel="canonical" href="https:\/\/awshackthon.vercel.app\/"/);
  assert.match(html, /property="og:url" content="https:\/\/awshackthon.vercel.app\/"/);
  for (const attribute of ['property="og:image"', 'name="twitter:image"']) {
    assert.equal(html.match(new RegExp(`${attribute} content="([^"]+)"`))[1],
      'https://awshackthon.vercel.app/og-image.png');
  }
});
