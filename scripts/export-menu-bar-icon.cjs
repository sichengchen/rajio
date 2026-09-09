// Run with Electron; rasterize the actual Icon Composer mark at menu-bar scale.
const { app, BrowserWindow } = require("electron");
const { readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");
app
  .whenReady()
  .then(async () => {
    const root = path.resolve(__dirname, "..");
    const svg = readFileSync(
      path.join(root, "apps/ios/Sources/Resources/Rajio.icon/Assets/Rajio-Mark.svg"),
      "utf8",
    ).replace('viewBox="0 0 512 512"', 'viewBox="72 72 368 368"');
    const window = new BrowserWindow({ show: false });
    await window.loadURL("data:text/html,<html></html>");
    for (const size of [18, 36]) {
      const value = await window.webContents.executeJavaScript(
        `(async()=>{const image=new Image();image.src='data:image/svg+xml;base64,'+btoa(${JSON.stringify(svg)});await image.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=${size};canvas.getContext('2d').drawImage(image,0,0,${size},${size});return canvas.toDataURL('image/png').split(',')[1];})()`,
      );
      writeFileSync(
        path.join(
          root,
          "apps/desktop/resources/trayTemplate" + (size === 36 ? "@2x" : "") + ".png",
        ),
        Buffer.from(value, "base64"),
      );
    }
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
