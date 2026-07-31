package com.mint.server.tool;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mint.server.ai.ToolDefinition;
import com.mint.server.security.WorkspaceGuard;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/** Performs lightweight structural validation of Wiki Markdown files. */
@Component
public class WikiLintTool implements Tool {
    private final WorkspaceGuard workspace;
    private final ObjectMapper mapper;
    public WikiLintTool(WorkspaceGuard workspace,ObjectMapper mapper){this.workspace=workspace;this.mapper=mapper;}
    public String name(){return "wiki_lint";}
    public ToolDefinition definition(){return new ToolDefinition(name(),"Validate Wiki Markdown structure.",Map.of("type","object","properties",Map.of("path",Map.of("type","string"))));}
    public String execute(Map<String,Object> arguments,String conversationId){try{Path root=workspace.resolve(String.valueOf(arguments.getOrDefault("path","wiki")));List<Map<String,Object>> issues=new ArrayList<>();try(var paths=Files.walk(root)){paths.filter(path->path.toString().endsWith(".md")).forEach(path->{try{String text=Files.readString(path);if(text.isBlank()||!text.contains("#"))issues.add(Map.of("path",workspace.root().relativize(path).toString(),"issue","missing Markdown heading"));}catch(Exception error){issues.add(Map.of("path",path.toString(),"issue",error.getMessage()==null?"read failed":error.getMessage()));}});}return mapper.writeValueAsString(Map.of("valid",issues.isEmpty(),"issues",issues));}catch(Exception error){return "Wiki lint failed: "+error.getMessage();}}
}
