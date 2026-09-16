import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const site = require('../docs/site.js');
const base = 'https://github.com/ahmed-mili/neo-calendar/releases/download/v1.80.0/';
const release = {
  tag_name: 'v1.80.0', draft: false, prerelease: false,
  assets: [
    { name: 'latest.json', browser_download_url: base + 'latest.json', size: 639 },
    { name: 'Neo-Calendar-Setup-1.80.0.exe.sig', browser_download_url: base + 'Neo-Calendar-Setup-1.80.0.exe.sig', size: 424 },
    { name: 'neo-calendar-android-1.80.0.apk', browser_download_url: base + 'neo-calendar-android-1.80.0.apk', size: 5299845 },
    { name: 'Neo-Calendar-Setup-1.80.0.exe', browser_download_url: base + 'Neo-Calendar-Setup-1.80.0.exe', size: 36803838 }
  ]
};

function fakeDocument() {
  const elements = {};
  for (const platform of ['windows', 'android']) {
    elements['carte-' + platform] = { href: site.RELEASES, setAttribute(name, value) { this[name] = value; } };
    elements['version-' + platform] = { textContent: 'See releases' };
    elements['taille-' + platform] = { textContent: '' };
  }
  return { getElementById(id) { return elements[id]; }, elements };
}

test('selects the actual release installer and APK, never metadata or signature', () => {
  const downloads = site.getDownloads(release);
  assert.equal(downloads.version, 'v1.80.0');
  assert.equal(downloads.windows.name, 'Neo-Calendar-Setup-1.80.0.exe');
  assert.equal(downloads.android.name, 'neo-calendar-android-1.80.0.apk');
});

test('does not present a nonexistent platform asset as downloadable', () => {
  const doc = fakeDocument();
  site.updateCards(doc, { ...release, assets: release.assets.filter(asset => !asset.name.endsWith('.apk')) }, 'en');
  assert.equal(doc.elements['carte-android'].href, site.RELEASES);
  assert.equal(doc.elements['version-android'].textContent, 'See releases');
  assert.equal(doc.elements['taille-android'].textContent, '');
  assert.equal(doc.elements['carte-windows'].href, base + 'Neo-Calendar-Setup-1.80.0.exe');
});

test('never accepts a foreign download URL, wrong tag, or prerelease', () => {
  const poisoned = { ...release, assets: release.assets.map(a => a.name.endsWith('.exe') ? { ...a, browser_download_url: 'https://example.com/download.exe' } : a) };
  assert.equal(site.getDownloads(poisoned).windows, null);
  assert.equal(site.getDownloads({ ...release, tag_name: 'v1.81.0' }).windows, null);
  assert.equal(site.getDownloads({ ...release, prerelease: true }), null);
  assert.equal(site.getDownloads({ ...release, draft: true }), null);
});

test('updates links, versions and localized file sizes from a release', () => {
  const doc = fakeDocument();
  site.updateCards(doc, release, 'fr');
  assert.equal(doc.elements['carte-windows'].href, base + 'Neo-Calendar-Setup-1.80.0.exe');
  assert.equal(doc.elements['carte-android'].href, base + 'neo-calendar-android-1.80.0.apk');
  assert.equal(doc.elements['version-windows'].textContent, 'v1.80.0');
  assert.equal(doc.elements['version-android'].textContent, 'v1.80.0');
  assert.match(doc.elements['taille-android'].textContent, / Mo$/);
  assert.match(doc.elements['carte-windows']['aria-label'], /Télécharger pour Windows/);
  assert.equal(site.formatSize(1572864, 'fr'), '1,5 Mo');
  assert.equal(site.formatSize(1572864, 'en'), '1.5 MB');
});

test('French and English pages include all IDs, explicit language links and safe fallback links', () => {
  for (const [path, language] of [['../docs/index.html', 'en'], ['../docs/fr/index.html', 'fr']]) {
    const html = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(html, new RegExp('<html lang="' + language + '">'));
    for (const id of ['carte-windows', 'carte-android', 'version-windows', 'version-android', 'taille-windows', 'taille-android', 'langue-menu']) {
      assert.ok(html.includes('id="' + id + '"'), id + ' missing from ' + path);
    }
    assert.equal((html.match(/href="https:\/\/github.com\/ahmed-mili\/neo-calendar\/releases\/latest"/g) || []).length, 2);
    assert.ok(html.includes('data-langue="' + (language === 'fr' ? 'en' : 'fr') + '"'));
    assert.ok(!html.includes('neo-quiz/releases'));
    assert.ok(!html.includes('carte-linux'));
    assert.ok(!html.includes('carte-obsidian'));
  }
});
