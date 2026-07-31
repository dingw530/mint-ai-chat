package com.mint.server.security;

import com.mint.server.security.dto.BashSecurityRequest;
import com.mint.server.security.dto.BashSecurityResponse;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** HTTP settings endpoint for Bash deny lists. */
@RestController
@RequestMapping("/api/bash-security")
public class BashSecurityController {
    private final BashSecurityService service;

    /** Creates the controller. */
    public BashSecurityController(BashSecurityService service) { this.service = service; }

    /** Returns deny lists. */
    @GetMapping({"", "/"}) public BashSecurityResponse get() { return service.get(); }
    /** Saves deny lists. */
    @PutMapping({"", "/"}) public Map<String, Boolean> update(@RequestBody BashSecurityRequest body) { service.update(body); return Map.of("success", true); }
}
