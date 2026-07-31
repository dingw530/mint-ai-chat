package com.mint.server.wiki.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Request body for adding a Wiki schema category. */
@Getter
@Setter
@NoArgsConstructor
public class WikiCategoryRequest {
    private String category;
}
