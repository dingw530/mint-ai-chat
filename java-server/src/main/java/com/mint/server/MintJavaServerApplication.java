package com.mint.server;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/** Spring Boot entry point for the HTTP-compatible Mint server. */
@SpringBootApplication
public class MintJavaServerApplication {

    /** Starts the Spring application. */
    public static void main(String[] args) {
        SpringApplication.run(MintJavaServerApplication.class, args);
    }
}
