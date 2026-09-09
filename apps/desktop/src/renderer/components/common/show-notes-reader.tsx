import { useMemo, type MouseEvent } from "react";
import DOMPurify from "dompurify";

import { processTimestamps } from "@/lib/utils";

interface ShowNotesReaderProps {
  content: string;
  onSeek: (seconds: number) => void;
}

function sanitizeShowNotes(html: string) {
  return DOMPurify.sanitize(html, {
    ALLOWED_ATTR: ["href", "title", "target", "rel", "class", "data-seconds"],
    ALLOWED_TAGS: [
      "p",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "a",
      "ul",
      "ol",
      "li",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "blockquote",
      "code",
      "pre",
      "button",
    ],
    ALLOWED_URI_REGEXP: /^https?:\/\/|^mailto:|^tel:|^#/i,
  });
}

function normalizeShowNotes(html: string) {
  let normalized = sanitizeShowNotes(html);

  if (
    !normalized.includes("<p>") &&
    !normalized.includes("<div>") &&
    !normalized.includes("<br>") &&
    !normalized.includes("<ol>") &&
    !normalized.includes("<ul>")
  ) {
    normalized = formatPlainTextShowNotes(normalized);
  } else {
    normalized = normalized.replace(/>\s*\n\s*</g, "><");
    normalized = normalized.replace(/\n{3,}/g, "\n\n");
    normalized = normalized.replace(/([^>])\n([^<\n])/g, "$1<br>$2");
    normalized = promoteEmbeddedHeadings(normalized);
  }

  normalized = normalized.replace(
    /<a\s+href="(https?:\/\/[^\"]+)"(?![^>]*target=)([^>]*)>/gi,
    '<a href="$1" target="_blank" rel="noopener noreferrer"$2>',
  );

  normalized = normalized.replace(
    /\b(https?:\/\/[^\s<>\"]+)/gi,
    (match, url, offset, fullString) => {
      const beforeMatch = fullString.substring(0, offset);
      const lastHref = beforeMatch.lastIndexOf('href="');
      const lastCloseQuote = beforeMatch.lastIndexOf('"');
      const lastOpenTag = beforeMatch.lastIndexOf("<");
      const lastCloseTag = beforeMatch.lastIndexOf(">");
      const afterMatch = fullString.substring(offset + match.length);
      const isInsideLink =
        afterMatch.indexOf("</a>") < afterMatch.indexOf("<a") && afterMatch.indexOf("</a>") !== -1;

      if (lastHref > lastCloseQuote || lastOpenTag > lastCloseTag || isInsideLink) {
        return match;
      }

      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    },
  );

  normalized = normalized.replace(
    /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b(?![^<]*<\/a>)/gi,
    (match, email) =>
      match.includes("href=") || match.includes("mailto:")
        ? match
        : `<a href="mailto:${email}">${email}</a>`,
  );

  return processTimestamps(normalized);
}

function promoteEmbeddedHeadings(html: string) {
  return html
    .replace(
      /<(?:strong|b)>\s*#{1,6}\s+([^<]+?)<\/(?:strong|b)>\s*(?:<br\s*\/?>(?:\s*<br\s*\/?>)*)/gi,
      "<h2>$1</h2>",
    )
    .replace(/<p>\s*#{1,6}\s+([^<]+?)<\/p>/gi, "<h2>$1</h2>")
    .replace(/<p>\s*#{1,6}\s+([^<]+?)(?:<br\s*\/?>(?:\s*<br\s*\/?>)*)/gi, "<h2>$1</h2><p>")
    .replace(
      /(?:<br\s*\/?>(?:\s*<br\s*\/?>)*)\s*#{1,6}\s+([^<]+?)(?:<br\s*\/?>(?:\s*<br\s*\/?>)*)/gi,
      "</p><h2>$1</h2><p>",
    )
    .replace(/<p>\s*<\/p>/gi, "");
}

function formatPlainTextShowNotes(text: string) {
  const blocks: string[] = [];
  let paragraphLines: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length > 0) {
      blocks.push(`<p>${paragraphLines.join("<br>")}</p>`);
      paragraphLines = [];
    }
  };

  for (const line of text.split("\n")) {
    const trimmedLine = line.trim();
    const heading = trimmedLine.match(/^(#{1,6})\s+(.+)$/);

    if (heading) {
      flushParagraph();
      const level = Math.min(heading[1].length + 1, 4);
      blocks.push(`<h${level}>${heading[2]}</h${level}>`);
    } else if (trimmedLine) {
      paragraphLines.push(trimmedLine);
    } else {
      flushParagraph();
    }
  }

  flushParagraph();
  return blocks.join("");
}

export function ShowNotesReader({ content, onSeek }: ShowNotesReaderProps) {
  const processedContent = useMemo(() => normalizeShowNotes(content), [content]);

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const timestamp = target.closest<HTMLButtonElement>("button.timestamp-link");

    if (timestamp) {
      event.preventDefault();
      onSeek(Number.parseInt(timestamp.dataset.seconds ?? "0", 10));
      return;
    }

    const anchor = target.closest<HTMLAnchorElement>("a");
    if (!anchor) {
      return;
    }

    const href = anchor.getAttribute("href");
    if (href?.startsWith("http://") || href?.startsWith("https://")) {
      event.preventDefault();
      window.open(href, "_blank", "noopener,noreferrer");
    } else if (href?.startsWith("mailto:")) {
      event.preventDefault();
      window.location.href = href;
    }
  };

  return (
    <article
      className="selectable-text prose max-w-none break-words text-[13.5px] leading-[1.72]
        [&_h1]:mb-2.5 [&_h1]:mt-5 [&_h1]:break-words [&_h1]:text-base [&_h1]:font-semibold [&_h1]:leading-6 [&_h1]:tracking-[-0.01em] [&_h1]:text-foreground
        [&_h2]:mb-2.5 [&_h2]:mt-4 [&_h2]:break-words [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:leading-5 [&_h2]:tracking-[-0.01em] [&_h2]:text-foreground
        [&_h3]:mb-2.5 [&_h3]:mt-4 [&_h3]:break-words [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:leading-5 [&_h3]:tracking-[-0.01em] [&_h3]:text-foreground
        [&_h4]:mb-2 [&_h4]:mt-4 [&_h4]:break-words [&_h4]:text-[13.5px] [&_h4]:font-semibold [&_h4]:leading-5 [&_h4]:text-foreground
        [&_h5]:mb-2 [&_h5]:mt-4 [&_h5]:break-words [&_h5]:text-[13.5px] [&_h5]:font-semibold [&_h5]:leading-5 [&_h5]:text-foreground
        [&_h6]:mb-2 [&_h6]:mt-4 [&_h6]:break-words [&_h6]:text-[13.5px] [&_h6]:font-semibold [&_h6]:leading-5 [&_h6]:text-muted-foreground
        prose-p:mb-4 prose-p:break-words prose-p:text-foreground/84
        prose-a:break-words prose-a:font-normal prose-a:text-foreground prose-a:decoration-muted-foreground/45 prose-a:underline prose-a:underline-offset-4
        prose-a:hover:decoration-foreground prose-strong:font-semibold prose-strong:text-foreground prose-em:text-foreground/90
        prose-ul:my-4 prose-ol:my-4 prose-li:my-1 prose-li:pl-1 prose-li:text-foreground/84
        prose-blockquote:my-5 prose-blockquote:border-l prose-blockquote:border-border prose-blockquote:pl-4 prose-blockquote:font-normal prose-blockquote:text-muted-foreground
        prose-code:rounded-sm prose-code:bg-muted/70 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[0.86em] prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none
        prose-pre:overflow-x-auto prose-pre:rounded-md prose-pre:border prose-pre:bg-muted/45 prose-pre:text-foreground
        [&_*]:break-words [&_a]:cursor-pointer [&_a]:underline [&_a]:underline-offset-4 [&_a]:decoration-muted-foreground/60 [&_a:hover]:decoration-foreground
        [&_.timestamp-link]:mr-0.5 [&_.timestamp-link]:border-0 [&_.timestamp-link]:bg-transparent [&_.timestamp-link]:p-0
        [&_.timestamp-link]:font-mono [&_.timestamp-link]:text-[0.85em] [&_.timestamp-link]:font-medium [&_.timestamp-link]:tabular-nums
        [&_.timestamp-link]:text-foreground [&_.timestamp-link]:underline [&_.timestamp-link]:decoration-muted-foreground/50
        [&_.timestamp-link]:underline-offset-4 [&_.timestamp-link]:cursor-pointer [&_.timestamp-link:hover]:decoration-foreground
        [&>:first-child]:mt-0"
      dangerouslySetInnerHTML={{ __html: processedContent }}
      onClick={handleClick}
    />
  );
}
