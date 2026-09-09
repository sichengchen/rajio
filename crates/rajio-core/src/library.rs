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
    NormalizeCollection {
        name: String,
        ids: Vec<String>,
    },
    ReconcileEpisodes {
        incoming: Vec<crate::Episode>,
        existing: Vec<crate::Episode>,
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
                if !id.is_empty() && id != episode_id && !result.contains(&id) {
                    result.push(id);
                }
            }
            if included {
                result.insert(index.unwrap_or(result.len()).min(result.len()), episode_id);
            }
            Ok(json!(result))
        }
        LibraryRequest::NormalizeCollection { name, ids } => {
            let limit = match name.as_str() {
                "favorites" => 500,
                "queue" => 100,
                _ => return Err("Unknown collection".into()),
            };
            let mut seen = std::collections::HashSet::new();
            let ids: Vec<_> = ids
                .into_iter()
                .filter(|id| !id.is_empty() && seen.insert(id.clone()))
                .take(limit)
                .collect();
            Ok(json!(ids))
        }
        LibraryRequest::ReconcileEpisodes { incoming, existing } => {
            let mut result: Vec<crate::Episode> = Vec::new();
            let same = |a: &crate::Episode, b: &crate::Episode| {
                a.podcast_id == b.podcast_id
                    && (a.audio_url == b.audio_url
                        || a.guid
                            .as_ref()
                            .filter(|g| !g.is_empty())
                            .is_some_and(|g| b.guid.as_ref() == Some(g)))
            };
            for mut episode in incoming {
                if result.iter().any(|saved| same(saved, &episode)) {
                    continue;
                }
                if let Some(saved) = existing.iter().find(|saved| same(saved, &episode)) {
                    episode.id = saved.id.clone();
                }
                result.push(episode);
            }
            let mut aliases = std::collections::BTreeMap::new();
            for old in &existing {
                if let Some(canonical) = result.iter().find(|entry| same(entry, old)) {
                    if canonical.id != old.id {
                        aliases.insert(old.id.clone(), canonical.id.clone());
                    }
                }
            }
            Ok(json!({"episodes": result, "aliases": aliases}))
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
    fn collection_limits_preserve_order_and_remove_empty_duplicates() {
        let mut ids = vec![String::new(), "first".into(), "first".into()];
        ids.extend((0..600).map(|n| n.to_string()));
        let queue = apply(LibraryRequest::NormalizeCollection {
            name: "queue".into(),
            ids: ids.clone(),
        })
        .unwrap();
        let favorites = apply(LibraryRequest::NormalizeCollection {
            name: "favorites".into(),
            ids,
        })
        .unwrap();
        assert_eq!(queue.as_array().unwrap().len(), 100);
        assert_eq!(queue[0], "first");
        assert_eq!(queue[1], "0");
        assert_eq!(favorites.as_array().unwrap().len(), 500);
        assert!(apply(LibraryRequest::NormalizeCollection {
            name: "other".into(),
            ids: vec![]
        })
        .is_err());
    }

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
