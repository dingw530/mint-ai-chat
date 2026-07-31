package com.mint.server.wiki;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mint.server.security.WorkspaceGuard;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** Verifies Wiki list responses preserve the Node directory-tree contract. */
class WikiServiceTest {
    @TempDir
    Path workspace;

    @Test
    void listReturnsNestedDirectoriesAndCountsFilesOnly() throws Exception {
        Path wiki = Files.createDirectories(workspace.resolve("wiki/pages"));
        Files.writeString(wiki.resolve("nested.md"), "nested");
        Files.writeString(workspace.resolve("wiki/root.md"), "root");
        Files.writeString(workspace.resolve("wiki/ignored.json"), "ignored");
        WikiRepository repository = mock(WikiRepository.class);
        when(repository.configuredPath()).thenReturn("wiki");

        Map<String, Object> result = new WikiService(repository,
                new WorkspaceGuard(workspace.toString()), new ObjectMapper()).list();

        assertEquals(2, result.get("total"));
        List<?> tree = assertInstanceOf(List.class, result.get("tree"));
        Map<?, ?> pages = assertInstanceOf(Map.class, tree.get(0));
        assertEquals("directory", pages.get("type"));
        assertEquals("pages", pages.get("path"));
        List<?> children = assertInstanceOf(List.class, pages.get("children"));
        assertEquals("pages/nested.md", ((Map<?, ?>) children.get(0)).get("path"));
    }
}
