import {readFileSync, readdirSync} from "node:fs";
import assert from "node:assert/strict";
const root = new URL("../apps/ios/Sources/", import.meta.url);
const languages = ["en","zh-Hans","zh-Hant","ja","fr","es","de"];
const tables = languages.map(language => Object.fromEntries([...readFileSync(new URL("Resources/"+language+".lproj/Localizable.strings",root),"utf8").matchAll(/^("(?:[^"\\]|\\.)*")\s*=\s*("(?:[^"\\]|\\.)*");/gm)].map(match=>[JSON.parse(match[1]),JSON.parse(match[2])])));
const keys=Object.keys(tables[0]).sort();
for(let i=1;i<tables.length;i++) {
  assert.deepEqual(Object.keys(tables[i]).sort(), keys, "Key coverage: "+languages[i]);
  for(const key of keys) assert.deepEqual(tables[i][key].match(/%(?:lld|@|d|f)/g), tables[0][key].match(/%(?:lld|@|d|f)/g), "Placeholders: "+languages[i]+" "+key);
}
const used=new Set();
for(const filename of readdirSync(root).filter(name=>name.endsWith(".swift"))) {
 const source=readFileSync(new URL(filename,root),"utf8");
 for(const match of source.matchAll(/(?:Text|Button|Toggle|Label|Menu|Picker|Section|LabeledContent|TextField|ProgressView|ContentUnavailableView|navigationTitle|accessibilityLabel|accessibilityHint|confirmationDialog|alert|L10n\.text)\(\s*"([^"\\]*)"/g)) used.add(match[1]);
 for(const match of source.matchAll(/prompt:\s*"([^"\\]*)"/g)) used.add(match[1]);
}
for(const key of used) assert.ok(key in tables[0],"Missing UI translation: "+key);
console.log("Verified "+keys.length+" keys in all seven iOS languages, including format placeholders.");
