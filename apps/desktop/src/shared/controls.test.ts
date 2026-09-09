import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultShortcuts, validateShortcuts } from './controls';
const changed = (accelerator: string, global = false) => ({...defaultShortcuts,toggle:{accelerator,global}});
test('shortcuts normalize modifier ordering and allow clearing',()=>{
  assert.equal(validateShortcuts(changed('Shift+Alt+CommandOrControl+P')).toggle.accelerator,'CommandOrControl+Alt+Shift+P');
  assert.equal(validateShortcuts(changed('')).toggle.accelerator,'');
});
test('shortcut duplicates and reserved editing/application commands are rejected',()=>{
  assert.throws(()=>validateShortcuts(changed('Left')),/conflict/);
  assert.throws(()=>validateShortcuts(changed('CommandOrControl+Q')),/conflict/);
  assert.throws(()=>validateShortcuts(changed('CommandOrControl+V')),/conflict/);
});
test('global shortcuts require modifiers and malformed values are rejected',()=>{
  assert.throws(()=>validateShortcuts(changed('Space',true)),/require/);
  assert.throws(()=>validateShortcuts(changed('CommandOrControl+CommandOrControl+P')),/Invalid/);
  assert.throws(()=>validateShortcuts(null),/Invalid/);
  assert.doesNotThrow(()=>validateShortcuts(changed('CommandOrControl+Alt+P',true)));
});
