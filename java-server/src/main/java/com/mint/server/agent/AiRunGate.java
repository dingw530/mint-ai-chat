package com.mint.server.agent;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Enforces global AI concurrency and prevents ReAct re-entry per conversation. */
@Component
public class AiRunGate {
    private final Semaphore global;
    private final ConcurrentHashMap<String, Semaphore> conversations = new ConcurrentHashMap<>();

    /** Creates a gate with the configured global limit, defaulting to twelve. */
    public AiRunGate(@Value("${mint.concurrency.max-ai-runs:12}") int maxRuns) {
        this.global = new Semaphore(maxRuns);
    }

    /** Acquires both global and conversation permits without waiting. */
    public boolean tryAcquire(String conversationId) {
        Semaphore conversation = conversations.computeIfAbsent(conversationId, ignored -> new Semaphore(1));
        if (!global.tryAcquire()) return false;
        if (conversation.tryAcquire()) return true;
        global.release();
        return false;
    }

    /** Releases permits after a stream terminates or is cancelled. */
    public void release(String conversationId) {
        Semaphore conversation = conversations.get(conversationId);
        if (conversation != null) {
            conversation.release();
            if (conversation.availablePermits() == 1) conversations.remove(conversationId, conversation);
        }
        global.release();
    }
}
