use std::ffi::{c_char, CStr, CString};

/// Parse a JSON request. Free the returned string with `rajio_core_free`.
///
/// # Safety
/// A non-null request must point to a readable NUL-terminated string for this call.
#[no_mangle]
pub unsafe extern "C" fn rajio_core_parse_feed(request: *const c_char) -> *mut c_char {
    unsafe { call(request, crate::parse_feed_json) }
}

/// Apply a JSON library command. Free the response with `rajio_core_free`.
///
/// # Safety
/// A non-null request must point to a readable NUL-terminated string for this call.
#[no_mangle]
pub unsafe extern "C" fn rajio_core_library(request: *const c_char) -> *mut c_char {
    unsafe { call(request, crate::library_json) }
}

unsafe fn call(request: *const c_char, operation: fn(&str) -> String) -> *mut c_char {
    let response = std::panic::catch_unwind(|| {
        if request.is_null() {
            return r#"{"error":"Missing request"}"#.to_owned();
        }
        // SAFETY: the caller supplies a readable NUL-terminated string.
        match unsafe { CStr::from_ptr(request) }.to_str() {
            Ok(request) => operation(request),
            Err(_) => r#"{"error":"Request must be UTF-8"}"#.to_owned(),
        }
    })
    .unwrap_or_else(|_| r#"{"error":"Core parsing failed"}"#.to_owned());
    CString::new(response)
        .expect("JSON escapes NUL characters")
        .into_raw()
}

/// Release a response allocated by `rajio_core_parse_feed`.
///
/// # Safety
/// Pass null or an unmodified, live response pointer exactly once.
#[no_mangle]
pub unsafe extern "C" fn rajio_core_free(response: *mut c_char) {
    if !response.is_null() {
        // SAFETY: ownership of the allocation is returned by the caller.
        drop(unsafe { CString::from_raw(response) });
    }
}
