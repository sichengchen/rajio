use chrono::{DateTime, SecondsFormat};
use regex::Regex;
use roxmltree::{Document, Node};
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
use url::Url;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParseFeedRequest {
    pub feed_url: String,
    pub xml: String,
    /// Supplied by the host so native and Wasm results are deterministic.
    pub fetched_at: String,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Podcast {
    pub id: String,
    pub feed_url: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(default)]
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    pub subscription_date: String,
    pub last_updated: String,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Episode {
    pub id: String,
    pub podcast_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub guid: Option<String>,
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    pub audio_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub published_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub struct ParsedFeed {
    pub episodes: Vec<Episode>,
    pub podcast: Podcast,
}

pub fn parse_feed(request: ParseFeedRequest) -> Result<ParsedFeed, String> {
    if request.xml.trim().is_empty() {
        return Err("RSS feed is empty".into());
    }
    let base = Url::parse(&request.feed_url).map_err(|_| "Invalid feed URL")?;
    if !matches!(base.scheme(), "http" | "https") || base.host_str().is_none() {
        return Err("Feed URL must use HTTP or HTTPS".into());
    }
    let fetched_at = DateTime::parse_from_rfc3339(&request.fetched_at)
        .map_err(|_| "Invalid fetchedAt timestamp")?
        .to_utc()
        .to_rfc3339_opts(SecondsFormat::Millis, true);
    let document = Document::parse(&request.xml).map_err(|e| format!("Invalid feed XML: {e}"))?;
    let root = document.root_element();
    let channel = match root.tag_name().name() {
        "rss" | "RDF" => child(root, "channel").ok_or("Feed channel is missing")?,
        "feed" => root,
        _ => return Err("Expected an RSS, RDF, or Atom feed".into()),
    };
    let podcast_id = format!("podcast_{}", legacy_hash(&request.feed_url));
    let image_url = image(channel, &base);
    let podcast = Podcast {
        id: podcast_id.clone(),
        feed_url: request.feed_url,
        title: first_text(channel, &["title"]).unwrap_or_else(|| base.host_str().unwrap().into()),
        author: first_text(channel, &["itunes:author", "author", "managingEditor"]),
        description: plain_text(first_text(channel, &["description", "subtitle", "summary"])),
        image_url: image_url.clone(),
        language: first_text(channel, &["language"]),
        subscription_date: fetched_at.clone(),
        last_updated: fetched_at,
    };
    let item_parent = if root.tag_name().name() == "RDF" {
        root
    } else {
        channel
    };
    let episodes = item_parent
        .children()
        .filter(|n| matches_name(*n, "item") || matches_name(*n, "entry"))
        .enumerate()
        .filter_map(|(index, item)| {
            let audio_url = audio(item)?;
            // Preserve persisted desktop IDs during extraction. Identity migration is separate.
            let id = format!(
                "episode_{}",
                legacy_hash(&format!("{podcast_id}:{audio_url}:{index}"))
            );
            Some(Episode {
                id,
                podcast_id: podcast_id.clone(),
                guid: first_text(item, &["guid", "id"]),
                title: first_text(item, &["title"]).unwrap_or_else(|| "Untitled Episode".into()),
                description: plain_text(first_text(item, &["description", "summary", "content"])),
                content: first_text(
                    item,
                    &["content:encoded", "content", "summary", "description"],
                ),
                audio_url,
                image_url: image(item, &base).or_else(|| image_url.clone()),
                published_at: first_text(item, &["pubDate", "published", "updated"])
                    .and_then(|s| date(&s)),
                duration: first_text(item, &["itunes:duration", "duration"])
                    .and_then(|s| duration(&s)),
            })
        })
        .collect();
    Ok(ParsedFeed { episodes, podcast })
}

fn matches_name(node: Node<'_, '_>, name: &str) -> bool {
    if !node.is_element() {
        return false;
    }
    let (prefix, local) = name.split_once(':').unwrap_or(("", name));
    if node.tag_name().name() != local {
        return false;
    }
    let ns = node.tag_name().namespace().unwrap_or("");
    match prefix {
        "itunes" => ns == "http://www.itunes.com/dtds/podcast-1.0.dtd",
        "media" => ns == "http://search.yahoo.com/mrss/",
        "content" => ns == "http://purl.org/rss/1.0/modules/content/",
        _ => {
            ns.is_empty() || ns == "http://www.w3.org/2005/Atom" || ns == "http://purl.org/rss/1.0/"
        }
    }
}

fn child<'a, 'input>(node: Node<'a, 'input>, name: &str) -> Option<Node<'a, 'input>> {
    node.children().find(|n| matches_name(*n, name))
}

fn text(node: Node<'_, '_>) -> Option<String> {
    let value: String = node
        .children()
        .filter_map(|n| if n.is_text() { n.text() } else { None })
        .collect();
    let trimmed = value.trim();
    if !trimmed.is_empty() {
        return Some(trimmed.into());
    }
    node.attribute("href")
        .map(str::to_owned)
        .or_else(|| child(node, "name").and_then(text))
}

fn first_text(node: Node<'_, '_>, names: &[&str]) -> Option<String> {
    names
        .iter()
        .find_map(|name| child(node, name).and_then(text))
}

fn audio(node: Node<'_, '_>) -> Option<String> {
    if let Some(url) = child(node, "enclosure").and_then(|n| n.attribute("url")) {
        if !url.trim().is_empty() {
            return Some(url.trim().into());
        }
    }
    for link in node.children().filter(|n| matches_name(*n, "link")) {
        if link.attribute("rel") == Some("enclosure") {
            if let Some(url) = link.attribute("href").filter(|s| !s.trim().is_empty()) {
                return Some(url.trim().into());
            }
        }
    }
    for name in ["media:content", "content"] {
        if let Some(url) = child(node, name)
            .and_then(|n| n.attribute("url"))
            .filter(|s| !s.trim().is_empty())
        {
            return Some(url.trim().into());
        }
    }
    first_text(node, &["link"])
}

fn image(node: Node<'_, '_>, base: &Url) -> Option<String> {
    let candidate = ["itunes:image", "media:thumbnail", "image"]
        .iter()
        .find_map(|name| child(node, name))?;
    let value = candidate
        .attribute("href")
        .or_else(|| candidate.attribute("url"))
        .map(str::to_owned)
        .or_else(|| first_text(candidate, &["url"]))
        .or_else(|| text(candidate))?;
    Some(
        base.join(&value)
            .map(|url| url.to_string())
            .unwrap_or(value),
    )
}

fn date(value: &str) -> Option<String> {
    DateTime::parse_from_rfc3339(value)
        .or_else(|_| DateTime::parse_from_rfc2822(value))
        .ok()
        .map(|d| d.to_utc().to_rfc3339_opts(SecondsFormat::Millis, true))
}

fn duration(value: &str) -> Option<f64> {
    let segments = value
        .split(':')
        .map(str::parse::<f64>)
        .collect::<Result<Vec<_>, _>>()
        .ok()?;
    if segments.is_empty()
        || segments.len() > 3
        || segments.iter().any(|n| !n.is_finite() || *n < 0.0)
    {
        return None;
    }
    let result = segments.iter().fold(0.0, |sum, n| sum * 60.0 + n);
    result.is_finite().then_some(result)
}

fn plain_text(value: Option<String>) -> String {
    static TAGS: OnceLock<Regex> = OnceLock::new();
    TAGS.get_or_init(|| Regex::new("<[^>]*>").unwrap())
        .replace_all(&value.unwrap_or_default(), " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn legacy_hash(value: &str) -> i64 {
    value
        .encode_utf16()
        .fold(0_i32, |hash, unit| {
            hash.wrapping_mul(31).wrapping_add(i32::from(unit))
        })
        .unsigned_abs()
        .into()
}
