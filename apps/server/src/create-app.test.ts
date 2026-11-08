import { describe, expect, it } from "vitest";
import type { SyncStateResponse } from "@rajio-app/contracts";
import { createApp } from "./adapters/http/create-app";
import { StaticBearerAuthGuard } from "./core/auth";
import { SyncService } from "./core/sync-service";
import { createTestServer } from "./test/test-harness";
import { createInMemoryRepositories, TestRealtimeCoordinator } from "./test/test-harness";

describe("createApp", () => {
  it("GET /healthz returns ok", async () => {
    const { app } = createTestServer();
    const response = await app.request("http://example.test/healthz");

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("ok");
  });

  it("GET /api/meta returns the portable server metadata", async () => {
    const { app } = createTestServer();
    const response = await app.request("http://example.test/api/meta");

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    await expect(response.json()).resolves.toEqual({
      appVersion: "test",
      protocolVersion: "1",
      realtime: true,
    });
  });

  it("authenticated sync routes reject missing bearer tokens", async () => {
    const { app } = createTestServer();
    const response = await app.request("http://example.test/api/sync/state");

    expect(response.status).toBe(401);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("authenticated sync routes reject invalid bearer tokens", async () => {
    const { app } = createTestServer();
    const response = await app.request("http://example.test/api/sync/state", {
      headers: {
        Authorization: "Bearer wrong",
      },
    });

    expect(response.status).toBe(401);
  });

  it("authenticated routes reject requests when the server token is not configured", async () => {
    const realtime = new TestRealtimeCoordinator();
    const app = createApp({
      authGuard: new StaticBearerAuthGuard(""),
      realtimeCoordinator: realtime,
      syncService: new SyncService(createInMemoryRepositories(), realtime),
      version: "test",
    });

    const response = await app.request("http://example.test/api/sync/state", {
      headers: {
        Authorization: "Bearer any",
      },
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Server auth token is not configured",
    });
  });

  it("authenticated sync routes answer CORS preflight", async () => {
    const { app } = createTestServer();
    const response = await app.request("http://example.test/api/sync/state", {
      headers: {
        "Access-Control-Request-Headers": "authorization,content-type",
        "Access-Control-Request-Method": "GET",
        Origin: "http://localhost:3000",
      },
      method: "OPTIONS",
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
      "Authorization, Content-Type",
    );
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, PUT, OPTIONS");
  });

  it("does not expose media, RSS, or download API routes", async () => {
    const { app } = createTestServer();

    for (const pathname of ["/api/rss", "/api/download", "/api/media/episode.mp3"]) {
      const response = await app.request(`http://example.test${pathname}`);
      expect(response.status).toBe(404);
    }
  });

  it("bootstrap merges subscriptions and preferences, then state is readable", async () => {
    const { app } = createTestServer();
    const response = await app.request("http://example.test/api/sync/bootstrap", {
      body: JSON.stringify({
        currentPlayback: null,
        deviceId: "device-a",
        playbackHistory: [],
        preferences: {
          autoPlay: true,
          itunesSearchEnabled: true,
          skipInterval: 45,
          updatedAt: "2026-04-18T00:00:00.000Z",
          whatsNewCount: 12,
        },
        subscriptions: [
          {
            deletedAt: null,
            feedUrl: "https://feed.example/rss.xml",
            status: "active",
            subscribedAt: "2026-04-18T00:00:00.000Z",
            updatedAt: "2026-04-18T00:00:00.000Z",
          },
        ],
      }),
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(200);
    const state = (await response.json()) as SyncStateResponse;
    expect(state.subscriptions).toHaveLength(1);
    expect(state.subscriptions[0]?.feedUrl).toBe("https://feed.example/rss.xml");
    expect(state.preferences.skipInterval).toBe(45);
    expect(state.preferences.whatsNewCount).toBe(12);
  });

  it("GET /api/sync/state returns the complete sync state shape", async () => {
    const { app } = createTestServer();
    const response = await app.request("http://example.test/api/sync/state", {
      headers: {
        Authorization: "Bearer test-token",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      currentPlayback: null,
      playbackHistory: [],
      preferences: {
        autoPlay: false,
        itunesSearchEnabled: true,
        skipInterval: 30,
        whatsNewCount: 10,
      },
      subscriptions: [],
    });
  });

  it("exports authenticated active subscriptions as JSON and escaped OPML", async () => {
    const date = "2026-04-18T00:00:00.000Z";
    const feedUrl = "https://feed.example/rss?a=1&b=2";
    const legacyUrl = "https://legacy.example/rss";
    const deletedUrl = "https://deleted.example/rss";
    const { app } = createTestServer({
      subscriptions: [
        { feedUrl, status: "active", subscribedAt: date, updatedAt: date },
        { feedUrl: legacyUrl, status: "active", subscribedAt: date, updatedAt: date },
        { feedUrl: deletedUrl, status: "deleted", subscribedAt: date, updatedAt: date },
      ],
    });
    const base = "http://example.test/api/sync/subscriptions";
    const headers = { Authorization: "Bearer test-token", "Content-Type": "application/json" };
    for (const url of [base, `${base}.opml`]) {
      expect((await app.request(url)).status).toBe(401);
      expect((await app.request(url, { headers: { Authorization: "Bearer wrong" } })).status).toBe(
        401,
      );
    }

    const metadata = {
      title: 'A & B <"show">',
      author: "A. Host",
      description: "A show's notes\nSecond line",
      imageUrl: "https://feed.example/cover.jpg",
      language: "en",
    };
    const update = await app.request(`${base}/metadata`, {
      body: JSON.stringify([
        { feedUrl, metadata },
        { feedUrl: deletedUrl, metadata },
      ]),
      headers,
      method: "PUT",
    });
    expect(update.status).toBe(204);

    const json = await app.request(base, { headers });
    expect(json.status).toBe(200);
    expect(json.headers.get("Cache-Control")).toBe("no-store");
    await expect(json.json()).resolves.toEqual({
      podcasts: [
        { ...metadata, feedUrl, subscribedAt: date },
        { feedUrl: legacyUrl, subscribedAt: date },
      ],
    });

    const opml = await app.request(`${base}.opml`, { headers });
    expect(opml.status).toBe(200);
    expect(opml.headers.get("Content-Disposition")).toContain("rajio-subscriptions.opml");
    expect(opml.headers.get("Cache-Control")).toBe("no-store");
    const xml = await opml.text();
    expect(xml).toContain('<opml version="2.0">');
    expect(xml).toContain('text="A &amp; B &lt;&quot;show&quot;&gt;"');
    expect(xml).toContain('xmlUrl="https://feed.example/rss?a=1&amp;b=2"');
    expect(xml).toContain('description="A show&apos;s notes&#10;Second line"');
    expect(xml).toContain(`text="${legacyUrl}"`);
    expect(xml).not.toContain(deletedUrl);
  });

  it("checkpoint updates state and publishes realtime events", async () => {
    const { app, realtime } = createTestServer();
    const checkpointResponse = await app.request(
      "http://example.test/api/sync/playback/checkpoint",
      {
        body: JSON.stringify({
          checkpoint: {
            currentTime: 120,
            duration: 240,
            isCompleted: false,
            lastPlayedAt: "2026-04-18T00:00:00.000Z",
            locator: {
              audioUrl: "https://cdn.example/episode.mp3",
              episodeGuid: "episode-guid",
              feedUrl: "https://feed.example/rss.xml",
            },
            updatedAt: "2026-04-18T00:00:00.000Z",
          },
          deviceId: "device-a",
        }),
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );

    expect(checkpointResponse.status).toBe(204);

    const stateResponse = await app.request("http://example.test/api/sync/state", {
      headers: {
        Authorization: "Bearer test-token",
      },
    });

    expect(stateResponse.status).toBe(200);
    const state = (await stateResponse.json()) as SyncStateResponse;
    expect(state.currentPlayback?.sourceDeviceId).toBe("device-a");
    expect(state.playbackHistory).toHaveLength(1);
    expect(realtime.publishedEvents).toHaveLength(1);
    expect(realtime.publishedEvents[0]?.type).toBe("playback.updated");
  });

  it("returns a structured 400 when sync routes receive invalid JSON", async () => {
    const { app } = createTestServer();
    const response = await app.request("http://example.test/api/sync/bootstrap", {
      body: "{not-json",
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Request body must be valid JSON",
    });
  });

  it("returns a structured 400 when domain validation fails", async () => {
    const { app } = createTestServer();
    const response = await app.request("http://example.test/api/sync/subscriptions/upsert", {
      body: JSON.stringify({ feedUrl: " " }),
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "feedUrl is required",
    });
  });

  it("returns a structured 500 when a handler throws unexpectedly", async () => {
    const realtime = new TestRealtimeCoordinator();
    const syncService = new SyncService(createInMemoryRepositories(), realtime);
    syncService.getState = async () => {
      throw new Error("boom");
    };
    const app = createApp({
      authGuard: { async authorize() {} },
      realtimeCoordinator: realtime,
      syncService,
      version: "test",
    });

    const response = await app.request("http://example.test/api/sync/state", {
      headers: {
        Authorization: "Bearer test-token",
      },
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
    });
  });

  it("subscription mutation endpoints update readable state", async () => {
    const { app } = createTestServer();

    const upsertResponse = await app.request("http://example.test/api/sync/subscriptions/upsert", {
      body: JSON.stringify({ feedUrl: " https://feed.example/rss.xml " }),
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    expect(upsertResponse.status).toBe(204);

    const deleteResponse = await app.request("http://example.test/api/sync/subscriptions/delete", {
      body: JSON.stringify({ feedUrl: "https://feed.example/rss.xml" }),
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    expect(deleteResponse.status).toBe(204);

    const stateResponse = await app.request("http://example.test/api/sync/state", {
      headers: {
        Authorization: "Bearer test-token",
      },
    });

    const state = (await stateResponse.json()) as SyncStateResponse;
    expect(state.subscriptions).toHaveLength(1);
    expect(state.subscriptions[0]).toMatchObject({
      feedUrl: "https://feed.example/rss.xml",
      status: "deleted",
    });
    expect(state.subscriptions[0]?.deletedAt).toBeTruthy();
  });

  it("preferences endpoint persists normalized settings", async () => {
    const { app } = createTestServer();
    const response = await app.request("http://example.test/api/sync/preferences", {
      body: JSON.stringify({
        preferences: {
          autoPlay: true,
          itunesSearchEnabled: false,
          skipInterval: 0,
          updatedAt: "2026-04-18T00:00:00.000Z",
          whatsNewCount: -4,
        },
      }),
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
      method: "PUT",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      autoPlay: true,
      itunesSearchEnabled: false,
      skipInterval: 1,
      whatsNewCount: 1,
    });
  });

  it("clear-current endpoint removes current playback", async () => {
    const { app } = createTestServer({
      currentPlayback: {
        currentTime: 10,
        duration: 100,
        locator: {
          audioUrl: "https://cdn.example/episode.mp3",
          feedUrl: "https://feed.example/rss.xml",
        },
        sourceDeviceId: "device-a",
        updatedAt: "2026-04-18T00:00:00.000Z",
      },
    });

    const response = await app.request("http://example.test/api/sync/playback/clear-current", {
      body: JSON.stringify({ deviceId: "device-a" }),
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(204);

    const stateResponse = await app.request("http://example.test/api/sync/state", {
      headers: {
        Authorization: "Bearer test-token",
      },
    });
    const state = (await stateResponse.json()) as SyncStateResponse;
    expect(state.currentPlayback).toBeNull();
  });

  it("issues realtime tickets and rejects blank ticket requests", async () => {
    const { app } = createTestServer();
    const response = await app.request("https://example.test/api/realtime-ticket", {
      body: JSON.stringify({ deviceId: " device-a " }),
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ticket: "ticket",
      wsUrl: "ws://example.test/ws/playback?ticket=ticket",
    });

    const blankResponse = await app.request("https://example.test/api/realtime-ticket", {
      body: JSON.stringify({ deviceId: " " }),
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    expect(blankResponse.status).toBe(400);
    await expect(blankResponse.json()).resolves.toEqual({
      error: "deviceId is required",
    });
  });

  it("rejects websocket connections without realtime tickets", async () => {
    const { app } = createTestServer();
    const response = await app.request("http://example.test/ws/playback");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Missing realtime ticket",
    });
  });
});
