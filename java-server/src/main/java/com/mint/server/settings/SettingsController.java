package com.mint.server.settings;

import com.mint.server.settings.dto.SettingsRequest;
import com.mint.server.settings.dto.SettingsResponse;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Existing settings GET/PUT HTTP contract. */
@RestController
@RequestMapping("/api/settings")
public class SettingsController {
    private final SettingsService service;

    /** Creates the settings controller. */
    public SettingsController(SettingsService service) {
        this.service = service;
    }

    /** Returns visible settings. */
    @GetMapping({"", "/"})
    public SettingsResponse get() {
        return service.get();
    }

    /** Saves settings and keeps the existing success response. */
    @PutMapping({"", "/"})
    @ResponseStatus(HttpStatus.OK)
    public Map<String, Boolean> save(@RequestBody SettingsRequest body) {
        service.save(body);
        return Map.of("success", true);
    }
}
