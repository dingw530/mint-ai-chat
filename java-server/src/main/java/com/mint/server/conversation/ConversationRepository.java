package com.mint.server.conversation;

import com.mint.server.ai.ToolCall;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mint.server.db.mapper.SqlMapper;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Repository;

/** MyBatis persistence operations for conversations and messages. */
@Repository
public class ConversationRepository {
    private final SqlMapper mapper;
    private final ObjectMapper json;
    public ConversationRepository(SqlMapper mapper, ObjectMapper json){this.mapper=mapper;this.json=json;}
    public List<Conversation> findAll(String type){return (type==null||type.isBlank()?mapper.conversations():mapper.conversationsByType(type)).stream().map(this::conversation).toList();}
    public Optional<Conversation> findById(String id){return mapper.conversation(id).stream().map(this::conversation).findFirst();}
    public Conversation create(String title,String type,String routingMode){String id=UUID.randomUUID().toString(),now=Instant.now().toString();Map<String,Object> p=new HashMap<>();p.put("id",id);p.put("title",title==null?"New Chat":title);p.put("type",type==null?"text":type);p.put("createdAt",now);p.put("updatedAt",now);p.put("lockedAgent",null);p.put("routingMode",routingMode==null?"auto":routingMode);mapper.insertConversation(p);return new Conversation(id,(String)p.get("title"),(String)p.get("type"),now,now,null,(String)p.get("routingMode"));}
    public Optional<Conversation> updateTitle(String id,String title){Map<String,Object> p=new HashMap<>();p.put("id",id);p.put("title",title);p.put("updatedAt",Instant.now().toString());return mapper.updateTitle(p)==0?Optional.empty():findById(id);}
    public Optional<Conversation> updateLockedAgent(String id,String agent){Map<String,Object> p=new HashMap<>();p.put("id",id);p.put("lockedAgent",agent);p.put("updatedAt",Instant.now().toString());return mapper.updateLockedAgent(p)==0?Optional.empty():findById(id);}
    public int delete(String id){return mapper.deleteConversation(id);} public int deleteAll(){return mapper.deleteAllConversations();}
    public List<Message> findMessages(String id){return mapper.messages(id).stream().map(this::message).peek(message -> message.setUiBlocks(findUiBlocks(message.getId()))).toList();}
    public String insertMessage(String conversationId,String role,String content,String reasoning,String imageData){Map<String,Object> p=new HashMap<>();String id=UUID.randomUUID().toString();p.put("id",id);p.put("conversationId",conversationId);p.put("role",role);p.put("content",content);p.put("reasoning",reasoning);p.put("imageData",imageData);p.put("createdAt",Instant.now().toString());mapper.insertMessage(p);return id;}
    public void insertUiBlock(UiBlock block) { try { Map<String,Object> p=new HashMap<>(); p.put("id",block.getId()); p.put("messageId",block.getMessageId()); p.put("blockIndex",block.getBlockIndex()); p.put("kind",block.getKind()); p.put("version",block.getVersion()); p.put("dataJson",json.writeValueAsString(block.getData())); p.put("createdAt",block.getCreatedAt()); p.put("updatedAt",block.getUpdatedAt()); mapper.insertUiBlock(p); } catch (Exception error) { throw new IllegalStateException("Unable to save UI block",error); } }
    private List<UiBlock> findUiBlocks(String messageId) { return mapper.uiBlocks(messageId).stream().map(row -> { try { java.util.Map<String,Object> data=json.readValue(String.valueOf(value(row,"data_json","dataJson")), java.util.Map.class); return new UiBlock(String.valueOf(value(row,"id")),messageId,number(value(row,"block_index","blockIndex")),data.get("textOffset") instanceof Number n?n.intValue():0,String.valueOf(value(row,"kind")),number(value(row,"version")),data,String.valueOf(value(row,"created_at","createdAt")),String.valueOf(value(row,"updated_at","updatedAt"))); } catch(Exception error) { return null; } }).filter(java.util.Objects::nonNull).toList(); }
    private Object value(Map<String,Object> row,String... keys){for(String key:keys)if(row.containsKey(key))return row.get(key);return null;}
    private int number(Object value){return value instanceof Number n?n.intValue():Integer.parseInt(String.valueOf(value));}
    public List<ChatMessage> findHistory(String id){return mapper.history(id).stream().map(r->new ChatMessage((String)r.get("role"),(String)r.get("content"),(String)r.get("reasoning"),List.of(),null)).toList();}
    private Conversation conversation(Map<String,Object> r){return new Conversation((String)r.get("id"),(String)r.get("title"),(String)r.get("type"),(String)r.get("createdAt"),(String)r.get("updatedAt"),(String)r.get("lockedAgent"),r.get("routingMode")==null||String.valueOf(r.get("routingMode")).isBlank()?"auto":String.valueOf(r.get("routingMode")));}
    private Message message(Map<String,Object> r){return new Message((String)r.get("id"),(String)r.get("conversationId"),(String)r.get("role"),(String)r.get("content"),(String)r.get("reasoning"),(String)r.get("imageData"),(String)r.get("createdAt"),List.of());}
    public record ChatMessage(String role,String content,String reasoning,List<ToolCall> toolCalls,String toolCallId){}
}
