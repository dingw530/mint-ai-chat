package com.mint.server.db;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.Configuration;

/** Registers the persistence mappers used by the repository layer. */
@Configuration
@MapperScan("com.mint.server.db.mapper")
public class MyBatisConfig {
}
