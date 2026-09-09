// Deterministic, local-only media for simulator acceptance tests.
import http from "node:http";
const port = Number(process.env.PORT ?? 8767);
const seconds = 120;
const rate = 8000;
const wav = Buffer.alloc(44 + seconds * rate * 2);
wav.write("RIFF", 0);
wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24);
wav.writeUInt32LE(rate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(wav.length - 44, 40);
for (let i = 0; i < seconds * rate; i++)
  wav.writeInt16LE(Math.round(Math.sin((i * 2 * Math.PI * 220) / rate) * 200), 44 + i * 2);
let offline = false;
http
  .createServer((request, response) => {
    if (request.method === "POST" && request.url === "/offline") {
      offline = true;
      response.end("offline");
      return;
    }
    if (request.method === "POST" && request.url === "/online") {
      offline = false;
      response.end("online");
      return;
    }
    if (offline) {
      response.writeHead(503);
      response.end("Fixture source offline");
      return;
    }
    if (request.url === "/feed.xml") {
      if (request.headers["if-none-match"] === '"fixture-v1"') {
        response.writeHead(304);
        response.end();
        return;
      }
      response.writeHead(200, { "Content-Type": "application/rss+xml", ETag: '"fixture-v1"' });
      response.end(
        `<rss version="2.0"><channel><title>Rajio Offline Acceptance</title><description>Local simulator acceptance feed</description>${["First", "Second"].map((title, i) => `<item><title>${title} Offline Episode</title><guid>offline-${i}</guid><pubDate>Tue, 08 Sep 2026 12:00:00 GMT</pubDate><description><![CDATA[<p>Local playback test with <a href="https://example.com">an external link</a>.</p>]]></description><enclosure url="http://127.0.0.1:${port}/audio.wav?episode=${i}" type="audio/wav"/></item>`).join("")}<item><title>Failed Download Episode</title><guid>failed</guid><enclosure url="http://127.0.0.1:${port}/failure" type="audio/wav"/></item></channel></rss>`,
      );
      return;
    }
    if (request.url?.startsWith("/audio.wav")) {
      const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      const start = range ? Number(range[1]) : 0;
      const end = range?.[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1;
      if (start >= wav.length || end < start) {
        response.writeHead(416);
        response.end();
        return;
      }
      response.writeHead(range ? 206 : 200, {
        "Content-Type": "audio/wav",
        "Accept-Ranges": "bytes",
        "Content-Length": end - start + 1,
        ...(range ? { "Content-Range": `bytes ${start}-${end}/${wav.length}` } : {}),
      });
      response.end(wav.subarray(start, end + 1));
      return;
    }
    response.writeHead(503);
    response.end("Fixture failure");
  })
  .listen(port, "127.0.0.1", () =>
    console.log(`Rajio fixture feed: http://127.0.0.1:${port}/feed.xml`),
  );
