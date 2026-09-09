//! Deterministic local library policies. Hosts commit the result and its operation together.
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum LibraryRequest {
    Subscription {
        feed_url: String,
        existing_date: Option<String>,
        fetched_at: String,
    },
    Checkpoint {
        episode_id: String,
        position: f64,
        duration: f64,
        updated_at: String,
    },
    Collection {
        ids: Vec<String>,
        episode_id: String,
        included: bool,
        index: Option<usize>,
    },
    ImportOpml {
        xml: String,
    },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Checkpoint {
    pub episode_id: String,
    pub position: f64,
    pub duration: f64,
    pub updated_at: String,
}

pub fn apply(request: LibraryRequest) -> Result<serde_json::Value, String> {
    use serde_json::json;
    match request {
        LibraryRequest::Subscription {
            feed_url,
            existing_date,
            fetched_at,
        } => {
            validate_url(&feed_url)?;
            let is_new = existing_date.is_none();
            Ok(json!({"subscriptionDate": existing_date.unwrap_or(fetched_at), "isNew": is_new}))
        }
        LibraryRequest::Checkpoint {
            episode_id,
            position,
            duration,
            updated_at,
        } => {
            if episode_id.is_empty()
                || !position.is_finite()
                || !duration.is_finite()
                || position < 0.0
                || duration < 0.0
            {
                return Err("Invalid playback progress".into());
            }
            let position = if duration > 0.0 {
                position.min(duration)
            } else {
                position
            };
            serde_json::to_value(Checkpoint {
                episode_id,
                position,
                duration,
                updated_at,
            })
            .map_err(|e| e.to_string())
        }
        LibraryRequest::Collection {
            ids,
            episode_id,
            included,
            index,
        } => {
            if episode_id.is_empty() {
                return Err("Missing episode ID".into());
            }
            let mut result = Vec::new();
            for id in ids {
                if id != episode_id && !result.contains(&id) {
                    result.push(id);
                }
            }
            if included {
                result.insert(index.unwrap_or(result.len()).min(result.len()), episode_id);
            }
            Ok(json!(result))
        }
        LibraryRequest::ImportOpml { xml } => {
            let document = roxmltree::Document::parse(&xml).map_err(|e| e.to_string())?;
            if document.root_element().tag_name().name() != "opml" {
                return Err("Expected an OPML document".into());
            }
            let mut feeds = Vec::new();
            for node in document.descendants().filter(|n| n.has_tag_name("outline")) {
                if let Some(value) = node
                    .attribute("xmlUrl")
                    .or_else(|| node.attribute("xmlurl"))
                {
                    let url = validate_url(value)?.to_string();
                    if !feeds.contains(&url) {
                        feeds.push(url);
                    }
                }
            }
            Ok(json!(feeds))
        }
    }
}

fn validate_url(value: &str) -> Result<url::Url, String> {
    let url = url::Url::parse(value).map_err(|_| "Invalid feed URL")?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err("Feed URL must use HTTP or HTTPS".into());
    }
    Ok(url)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn checkpoint_bounds_and_unknown_duration() {
        let request = |position, duration| LibraryRequest::Checkpoint {
            episode_id: "e".into(),
            position,
            duration,
            updated_at: "now".into(),
        };
        assert_eq!(apply(request(120.0, 90.0)).unwrap()["position"], 90.0);
        assert_eq!(apply(request(120.0, 0.0)).unwrap()["position"], 120.0);
        assert!(apply(request(-1.0, 90.0)).is_err());
    }
    #[test]
    fn ordered_collection_deduplicates_and_moves() {
        assert_eq!(
            apply(LibraryRequest::Collection {
                ids: vec!["a".into(), "b".into(), "a".into()],
                episode_id: "b".into(),
                included: true,
                index: Some(0)
            })
            .unwrap(),
            serde_json::json!(["b", "a"])
        );
    }
    #[test]
    fn nested_opml_and_scheme_validation() {
        assert_eq!(apply(LibraryRequest::ImportOpml { xml: r#"<opml><body><outline text="group"><outline xmlUrl="https://example.com/feed"/><outline xmlUrl="https://example.com/feed"/></outline></body></opml>"#.into() }).unwrap(), serde_json::json!(["https://example.com/feed"]));
        assert!(apply(LibraryRequest::ImportOpml {
            xml: r#"<opml><outline xmlUrl="file:///secret"/></opml>"#.into()
        })
        .is_err());
    }
}
