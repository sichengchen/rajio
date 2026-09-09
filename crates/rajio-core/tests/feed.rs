use rajio_core::parse_feed_json;
use serde_json::{json, Value};

#[test]
fn matches_existing_desktop_fixtures() {
    for fixture in [
        include_str!("fixtures/rss.json"),
        include_str!("fixtures/atom.json"),
        include_str!("fixtures/unicode.json"),
        include_str!("fixtures/empty-channel.json"),
    ] {
        let fixture: Value = serde_json::from_str(fixture).unwrap();
        let result: Value =
            serde_json::from_str(&parse_feed_json(&fixture["request"].to_string())).unwrap();
        assert_eq!(
            serde_json::from_value::<rajio_core::ParsedFeed>(result["value"].clone()).unwrap(),
            serde_json::from_value::<rajio_core::ParsedFeed>(fixture["expected"].clone()).unwrap(),
        );
    }
}

#[test]
fn invalid_inputs_return_errors() {
    for xml in [
        " ",
        "<rss>",
        "<html><body>Not a feed</body></html>",
        "<!DOCTYPE rss [<!ENTITY a 'x'>]><rss><channel>&a;</channel></rss>",
    ] {
        let request = json!({"feedUrl":"https://example.com/feed", "fetchedAt":"2026-09-05T00:00:00Z", "xml":xml});
        let result: Value = serde_json::from_str(&parse_feed_json(&request.to_string())).unwrap();
        assert!(result["error"].is_string(), "{result}");
    }
    for request in [
        "{}",
        "invalid",
        r#"{"feedUrl":"file:///tmp/feed","xml":"<rss><channel/></rss>","fetchedAt":"bad"}"#,
    ] {
        let result: Value = serde_json::from_str(&parse_feed_json(request)).unwrap();
        assert!(result["error"].is_string());
    }
}

#[test]
fn supports_namespace_aliases_and_rdf_items() {
    let request = json!({
        "feedUrl":"https://example.com/feed", "fetchedAt":"2026-09-05T00:00:00Z",
        "xml":r#"<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:pod="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel><title>RDF</title><pod:author>Author</pod:author></channel><item><title>Episode</title><enclosure url="https://example.com/a.mp3"/><pod:duration>NaN</pod:duration></item></rdf:RDF>"#
    });
    let result: Value = serde_json::from_str(&parse_feed_json(&request.to_string())).unwrap();
    assert_eq!(result["value"]["podcast"]["author"], "Author");
    assert_eq!(result["value"]["episodes"].as_array().unwrap().len(), 1);
    assert!(result["value"]["episodes"][0].get("duration").is_none());
}
