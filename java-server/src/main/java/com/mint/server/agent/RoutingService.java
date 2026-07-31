package com.mint.server.agent;

import com.mint.server.agent.dto.AgentResponse;
import com.mint.server.conversation.Conversation;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

/** Selects the Agent for a message and records the routing decision. */
@Service
public class RoutingService {
    private final AgentService agents;
    private final RoutingLogRepository logs;

    /** Creates the routing service. */
    public RoutingService(AgentService agents, RoutingLogRepository logs) {
        this.agents = agents;
        this.logs = logs;
    }

    /** Routes a message using locked-agent, manual and keyword rules. */
    public RouteResult route(String message, Conversation conversation) {
        return route(message, conversation, null);
    }

    /** Routes a message while honoring an explicitly selected agent. */
    public RouteResult route(String message, Conversation conversation, String explicitAgent) {
        Instant started = Instant.now();
        AgentResponse selected = null;
        String method = "fallback";
        double confidence = 0;
        if (explicitAgent != null && !explicitAgent.isBlank()) {
            selected = find(explicitAgent);
            method = "explicit";
            confidence = selected == null ? 0 : 1;
        } else if (conversation.getLockedAgent() != null && !conversation.getLockedAgent().isBlank()) {
            selected = find(conversation.getLockedAgent());
            method = "locked";
            confidence = 1;
        } else if (!"manual".equalsIgnoreCase(conversation.getRoutingMode())) {
            Match match = keywordMatch(message, agents.list());
            selected = match.agent();
            confidence = match.confidence();
            method = selected == null ? "fallback" : "keyword";
        }
        if (selected == null) selected = find("general");
        long latency = Duration.between(started, Instant.now()).toMillis();
        logs.create(conversation, selected, confidence, method, latency, message);
        return new RouteResult(selected, confidence, method, latency);
    }

    private AgentResponse find(String id) {
        return agents.list().stream().filter(agent -> id.equals(agent.getId()) && agent.isAvailable()).findFirst().orElse(null);
    }

    private Match keywordMatch(String message, List<AgentResponse> candidates) {
        String actual = message == null ? "" : message;
        AgentResponse best = null;
        double score = 0;
        for (AgentResponse agent : candidates) {
            if (!agent.isAvailable() || agent.getTriggerKeywords() == null) continue;
            for (String keyword : agent.getTriggerKeywords()) {
                if (keyword == null || keyword.isBlank()) continue;
                double current = match(actual, keyword);
                if (current > score) {
                    score = current;
                    best = agent;
                }
            }
        }
        return new Match(best, score);
    }

    private double match(String message, String keyword) {
        if (message.equals(keyword)) return 1.0;
        if (keyword.startsWith("/") && keyword.endsWith("/") && keyword.length() > 2) {
            try { return Pattern.compile(keyword.substring(1, keyword.length() - 1)).matcher(message).find() ? 0.9 : 0; }
            catch (RuntimeException ignored) { return 0; }
        }
        return message.toLowerCase(Locale.ROOT).contains(keyword.toLowerCase(Locale.ROOT)) ? 0.6 : 0;
    }

    /** Result of one routing decision. */
    public record RouteResult(AgentResponse agent, double confidence, String method, long latencyMs) {}
    private record Match(AgentResponse agent, double confidence) {}
}
