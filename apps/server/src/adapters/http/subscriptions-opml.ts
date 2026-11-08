import type { SubscribedPodcast } from "@rajio-app/contracts";

const xmlEscapes: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
  "\t": "&#9;",
  "\n": "&#10;",
  "\r": "&#13;",
};

function escapeAttribute(value: string): string {
  return value
    .replace(/[^\t\n\r\u{20}-\u{D7FF}\u{E000}-\u{FFFD}\u{10000}-\u{10FFFF}]/gu, "")
    .replace(/[&<>"'\t\n\r]/g, (character) => xmlEscapes[character]);
}

export function createSubscriptionsOpml(podcasts: SubscribedPodcast[]): string {
  const outlines = podcasts.map(({ feedUrl, title, description, language }) => {
    const name = escapeAttribute(title || feedUrl);
    const attributes = [
      'type="rss"',
      `text="${name}"`,
      `title="${name}"`,
      `xmlUrl="${escapeAttribute(feedUrl)}"`,
    ];
    if (description) attributes.push(`description="${escapeAttribute(description)}"`);
    if (language) attributes.push(`language="${escapeAttribute(language)}"`);
    return `    <outline ${attributes.join(" ")} />`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    "  <head><title>Rajio subscriptions</title></head>",
    "  <body>",
    ...outlines,
    "  </body>",
    "</opml>",
    "",
  ].join("\n");
}
