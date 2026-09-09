import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import type { WebContents } from "electron";

import { registerExternalNavigation } from "./external-navigation";

function setup(currentUrl = "file:///app/index.html#/new") {
  const contents = new EventEmitter();
  const opened: string[] = [];
  let popup!: (details: { url: string }) => { action: string };
  Object.assign(contents, {
    getURL: () => currentUrl,
    setWindowOpenHandler: (handler: typeof popup) => {
      popup = handler;
    },
  });
  registerExternalNavigation(contents as WebContents, async (url) => {
    opened.push(url);
  });
  return {
    opened,
    popup: (url: string) => popup({ url }),
    navigate(url: string) {
      let prevented = false;
      contents.emit(
        "will-navigate",
        {
          preventDefault() {
            prevented = true;
          },
        },
        url,
      );
      return prevented;
    },
  };
}

test("new-window web links open externally without creating an Electron window", () => {
  const app = setup();
  assert.deepEqual(app.popup("https://example.com/episode"), { action: "deny" });
  assert.deepEqual(app.opened, ["https://example.com/episode"]);
});

test("same-window web and contact links open through the system handler", () => {
  const app = setup();
  for (const url of [
    "https://example.com",
    "http://example.com",
    "mailto:hello@example.com",
    "tel:+123456789",
  ]) {
    assert.equal(app.navigate(url), true);
    assert.equal(app.opened.at(-1), url);
  }
});

test("internal hash navigation and reload stay in Rajio in dev and packaged builds", () => {
  for (const base of ["file:///app/index.html", "http://127.0.0.1:5173/"]) {
    const app = setup(`${base}#/new`);
    assert.equal(app.navigate(`${base}#/episode/123`), false);
    assert.equal(app.navigate(base), false);
    assert.deepEqual(app.opened, []);
  }
});

test("unsupported and malformed links neither leave the app nor open externally", () => {
  const app = setup();
  for (const url of ["file:///other.html", "javascript:alert(1)", "custom:launch", "invalid url"]) {
    assert.equal(app.navigate(url), true);
    assert.deepEqual(app.popup(url), { action: "deny" });
  }
  assert.deepEqual(app.opened, []);
});
