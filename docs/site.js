/* Adapted from Neo Quiz's GitHub Pages download logic.
 * Never guess asset names from the latest tag: display/download only assets
 * that GitHub confirms are present in the latest stable release. */
(function (root) {
  'use strict';

  var REPO = 'ahmed-mili/neo-calendar';
  var RELEASES = 'https://github.com/' + REPO + '/releases/latest';
  var API = 'https://api.github.com/repos/' + REPO + '/releases/latest';

  function findAsset(assets, exactName, tag) {
    var expected = 'https://github.com/' + REPO + '/releases/download/' + tag + '/' + exactName;
    return (Array.isArray(assets) ? assets : []).find(function (asset) {
      return asset && asset.name === exactName && asset.browser_download_url === expected &&
        Number.isFinite(asset.size) && asset.size > 0;
    }) || null;
  }

  function getDownloads(release) {
    var tag = release && release.tag_name;
    if (typeof tag !== 'string' || !/^v\d+\.\d+\.\d+$/.test(tag) ||
        release.draft || release.prerelease) return null;
    var version = tag.slice(1);
    return {
      version: tag,
      windows: findAsset(release.assets, 'Neo-Calendar-Setup-' + version + '.exe', tag),
      android: findAsset(release.assets, 'neo-calendar-android-' + version + '.apk', tag)
    };
  }

  function formatSize(bytes, lang) {
    var mb = bytes / (1024 * 1024);
    var number = mb < 10 ? mb.toFixed(1) : String(Math.round(mb));
    return number.replace('.', lang === 'fr' ? ',' : '.') + (lang === 'fr' ? ' Mo' : ' MB');
  }

  function updateCards(doc, release, lang) {
    var downloads = getDownloads(release);
    if (!downloads) return;
    ['windows', 'android'].forEach(function (platform) {
      var asset = downloads[platform];
      var card = doc.getElementById('carte-' + platform);
      var version = doc.getElementById('version-' + platform);
      var size = doc.getElementById('taille-' + platform);
      if (!card || !version || !size || !asset) return;
      card.href = asset.browser_download_url;
      version.textContent = downloads.version;
      size.textContent = formatSize(asset.size, lang);
      card.setAttribute('aria-label', (lang === 'fr' ? 'Télécharger pour ' : 'Download for ') +
        (platform === 'windows' ? 'Windows' : 'Android') + ' ' + downloads.version);
    });
  }

  function initialize(doc, fetcher) {
    if (!doc) return;
    var lang = doc.documentElement.lang === 'fr' ? 'fr' : 'en';
    var container = doc.getElementById('langue');
    var button = doc.getElementById('langue-bouton');
    var menu = doc.getElementById('langue-menu');
    if (container && button && menu) {
      function close() { menu.hidden = true; button.setAttribute('aria-expanded', 'false'); }
      button.addEventListener('click', function (event) {
        event.preventDefault();
        menu.hidden = !menu.hidden;
        button.setAttribute('aria-expanded', String(!menu.hidden));
      });
      menu.querySelectorAll('a[data-langue]').forEach(function (link) {
        link.addEventListener('click', function () {
          try { root.localStorage.setItem('nc-langue', link.getAttribute('data-langue')); }
          catch (error) { /* Browser storage can be disabled; ?lang= still works. */ }
        });
      });
      doc.addEventListener('click', function (event) {
        if (!container.contains(event.target)) close();
      });
      doc.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') close();
      });
    }
    if (typeof fetcher !== 'function') return;
    fetcher(API, { headers: { Accept: 'application/vnd.github+json' } })
      .then(function (response) {
        if (!response.ok) throw new Error('Release API unavailable');
        return response.json();
      })
      .then(function (release) { updateCards(doc, release, lang); })
      .catch(function () {
        /* The cards already link to /releases/latest. Do not invent a version. */
      });
  }

  var exports = { REPO: REPO, RELEASES: RELEASES, API: API,
    findAsset: findAsset, getDownloads: getDownloads,
    formatSize: formatSize, updateCards: updateCards, initialize: initialize };
  if (typeof module !== 'undefined' && module.exports) module.exports = exports;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        initialize(document, typeof fetch === 'function' ? fetch.bind(root) : null);
      });
    } else {
      initialize(document, typeof fetch === 'function' ? fetch.bind(root) : null);
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
