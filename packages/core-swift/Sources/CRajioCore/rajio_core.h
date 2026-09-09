#ifndef RAJIO_CORE_H
#define RAJIO_CORE_H

// Request is a NUL-terminated UTF-8 JSON string, borrowed for the call.
// Response is owned by the caller; release it exactly once with rajio_core_free.
char *rajio_core_parse_feed(const char *request);
void rajio_core_free(char *response);

#endif
char *rajio_core_library(const char *request);
