package com.mint.server.api;

import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

/** Keeps error responses compatible with the existing {error: string} contract. */
@RestControllerAdvice
public class ApiExceptionHandler {
    /** Handles explicit status failures. */
    @ExceptionHandler(ResponseStatusException.class)
    public org.springframework.http.ResponseEntity<Map<String, String>> responseStatus(ResponseStatusException error) {
        return org.springframework.http.ResponseEntity.status(error.getStatusCode())
                .body(Map.of("error", error.getReason() == null ? "Request failed" : error.getReason()));
    }

    /** Handles request validation failures. */
    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Map<String, String> badRequest(IllegalArgumentException error) {
        return Map.of("error", error.getMessage() == null ? "Invalid request" : error.getMessage());
    }

    /** Handles security failures without leaking filesystem details. */
    @ExceptionHandler(SecurityException.class)
    @ResponseStatus(HttpStatus.FORBIDDEN)
    public Map<String, String> forbidden(SecurityException error) {
        return Map.of("error", error.getMessage() == null ? "Permission denied" : error.getMessage());
    }
}
