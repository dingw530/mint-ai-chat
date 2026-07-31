package com.mint.server.skill;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/** Scans local Markdown Skills and exposes their metadata to the runtime. */
@Service
public class SkillService {
    private final Path root;
    public SkillService(@Value("${mint.skills.path:${mint.workspace.path:/workspace}/skills}") String path) { this.root=Path.of(path).toAbsolutePath().normalize(); }
    /** Lists skill metadata. */
    public List<Map<String,String>> list() { List<Map<String,String>> result=new ArrayList<>(); if(!Files.isDirectory(root)) return result; try(var paths=Files.walk(root,2)){paths.filter(path->path.getFileName().toString().equals("SKILL.md")||path.toString().endsWith(".md")).sorted(Comparator.comparing(Path::toString)).forEach(path->{try{String content=Files.readString(path,StandardCharsets.UTF_8);String name=path.getFileName().toString().replaceFirst("\\.md$","");String description=front(content,"description");result.add(Map.of("name",front(content,"name",name),"description",description.isBlank()?name+" skill":description));}catch(IOException ignored){}});}catch(IOException ignored){} return result; }
    /** Reads one skill by name or workspace-relative Markdown path. */
    public String read(String name) { try { Path path=name.endsWith(".md")?root.resolve(name).normalize():root.resolve(name).resolve("SKILL.md").normalize(); if(!path.startsWith(root)) throw new SecurityException("Skill path outside skills directory"); return Files.readString(path,StandardCharsets.UTF_8); } catch(IOException error){ throw new IllegalArgumentException("Skill not found: "+name,error); } }
    private String front(String content,String key){return front(content,key,"");}
    private String front(String content,String key,String fallback){if(!content.startsWith("---"))return fallback;for(String line:content.split("\\R")){if(line.startsWith(key+":"))return line.substring(key.length()+1).trim().replaceAll("^[\\\"']|[\\\"']$","");}return fallback;}
}
