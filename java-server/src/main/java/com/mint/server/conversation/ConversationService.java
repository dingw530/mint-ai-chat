package com.mint.server.conversation;

import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/** Applies conversation validation and Node-compatible response semantics. */
@Service
public class ConversationService {
    private final ConversationRepository repository;

    /** Creates a service backed by the conversation repository. */
    public ConversationService(ConversationRepository repository) {
        this.repository = repository;
    }

    /** Lists conversations, optionally filtered by type. */
    public List<Conversation> list(String type) {
        return repository.findAll(type);
    }

    /** Creates a text or image conversation. */
    public Conversation create(String title, String type) {
        if (type != null && !type.equals("text") && !type.equals("image")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Type must be \"text\" or \"image\"");
        }
        return repository.create(title, type, "auto");
    }

    /** Renames a conversation. */
    public Conversation rename(String id, String title) {
        if (title == null || title.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Title is required");
        }
        return repository.updateTitle(id, title)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conversation not found"));
    }

    /** Locks or unlocks an agent. */
    public Conversation lockAgent(String id, String agent) {
        return repository.updateLockedAgent(id, agent)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conversation not found"));
    }

    /** Deletes a conversation. */
    public void delete(String id) {
        if (repository.delete(id) == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Conversation not found");
        }
    }

    /** Deletes all conversations. */
    public int deleteAll() {
        return repository.deleteAll();
    }

    /** Returns messages for an existing conversation. */
    public List<Message> messages(String id) {
        if (repository.findById(id).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Conversation not found");
        }
        return repository.findMessages(id);
    }

    /** Generates a deterministic compatible title from the first user message. */
    public String generateTitle(String id) {
        if (repository.findById(id).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Conversation not found");
        }
        String title = repository.findMessages(id).stream().filter(message -> "user".equals(message.getRole()))
                .map(Message::getContent).findFirst().orElse("New Conversation").trim();
        String compact = title.length() > 40 ? title.substring(0, 40) : title;
        repository.updateTitle(id, compact);
        return compact;
    }
}
