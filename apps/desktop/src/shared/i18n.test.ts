import assert from 'node:assert/strict';
import test from 'node:test';
import { getLocale, resolveLocale, setLanguage, subscribeLocale, t } from './i18n';

test('system languages resolve scripts and regions to supported catalogs', () => {
  assert.equal(resolveLocale('zh-TW'), 'zh-Hant');
  assert.equal(resolveLocale('zh-Hans-SG'), 'zh-Hans');
  assert.equal(resolveLocale('fr-CA'), 'fr');
  assert.equal(resolveLocale('pt-BR'), 'en');
});

test('manual language overrides system choice and notifies mounted UI', () => {
  let changes = 0;
  const unsubscribe = subscribeLocale(() => changes++);
  setLanguage('fr', 'de-DE');
  assert.equal(getLocale(), 'fr');
  assert.equal(t('Library'), 'Bibliothèque');
  assert.equal(t('Subscribed to {name}', { name: 'Example' }), 'Abonnement à Example effectué');
  setLanguage('system', 'ja-JP');
  assert.equal(getLocale(), 'ja');
  assert.equal(changes, 2);
  unsubscribe();
  setLanguage('en');
});

test('all seven locales translate navigation and interpolate user text literally', () => {
  for (const locale of ['en', 'zh-Hans', 'zh-Hant', 'ja', 'fr', 'es', 'de']) {
    setLanguage(locale);
    assert.ok(t('Language').length > 0);
    if (locale !== 'en') assert.notEqual(t('Library'), 'Library');
    const name = '<Example> $&';
    assert.ok(t('Play {name}', { name }).includes(name));
    assert.ok(!t('Results in {source}: {count}', { source: 'X', count: 3 }).includes('{count}'));
  }
  setLanguage('en');
});
