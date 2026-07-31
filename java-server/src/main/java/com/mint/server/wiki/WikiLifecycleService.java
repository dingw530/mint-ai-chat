package com.mint.server.wiki;

import jakarta.annotation.PostConstruct;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.springframework.stereotype.Service;

/** Applies Wiki claim retention and confirmation lifecycle rules. */
@Service
public class WikiLifecycleService {
    private final WikiRepository repository;
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();

    public WikiLifecycleService(WikiRepository repository) { this.repository = repository; }

    @PostConstruct
    public void start() {
        scheduler.execute(this::runOnce);
        scheduler.scheduleWithFixedDelay(this::runOnce, 6, 6, TimeUnit.HOURS);
    }

    /** Expires claims that have not been confirmed for the configured retention window. */
    public void runOnce() {
        Instant cutoff = Instant.now().minus(Duration.ofDays(180));
        for (Map<String,Object> page : repository.lifecyclePages()) {
            for (Map<String,Object> claim : repository.claimsByPage(String.valueOf(page.get("id")))) {
                String confirmed = claim.get("last_confirmed_at") == null ? String.valueOf(claim.get("created_at")) : String.valueOf(claim.get("last_confirmed_at"));
                try {
                    if (Instant.parse(confirmed).isBefore(cutoff)) repository.expireClaim(String.valueOf(claim.get("id")), Instant.now().toString());
                } catch (RuntimeException ignored) { }
            }
        }
        repository.lifecycleRun();
    }
}
