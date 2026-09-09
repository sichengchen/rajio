//! Platform-independent podcast domain logic. Hosts supply I/O and timestamps.

mod feed;
mod library;
#[cfg(not(target_arch = "wasm32"))]
mod native;

pub use feed::{parse_feed, Episode, ParseFeedRequest, ParsedFeed, Podcast};
use serde::Serialize;

#[derive(Serialize)]
#[serde(untagged)]
enum Response {
    Success { value: Box<ParsedFeed> },
    Failure { error: String },
}

/// JSON boundary shared by Swift and Wasm. Errors use the same envelope on both.
#[cfg_attr(target_arch = "wasm32", wasm_bindgen::prelude::wasm_bindgen)]
pub fn parse_feed_json(request: &str) -> String {
    let result = serde_json::from_str::<ParseFeedRequest>(request)
        .map_err(|error| format!("Invalid request: {error}"))
        .and_then(parse_feed);
    let response = match result {
        Ok(value) => Response::Success {
            value: Box::new(value),
        },
        Err(error) => Response::Failure { error },
    };
    serde_json::to_string(&response).expect("feed response is JSON serializable")
}

/// Apply a local library command without I/O.
#[cfg_attr(target_arch = "wasm32", wasm_bindgen::prelude::wasm_bindgen)]
pub fn library_json(request: &str) -> String {
    let result = serde_json::from_str::<library::LibraryRequest>(request)
        .map_err(|error| format!("Invalid request: {error}"))
        .and_then(library::apply);
    match result {
        Ok(value) => serde_json::json!({"value": value}).to_string(),
        Err(error) => serde_json::json!({"error": error}).to_string(),
    }
}
