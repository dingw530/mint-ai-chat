# 设计文档：Wiki Schema 分类标准维护

## Schema 结构

```json
{
  "categories": [
    {
      "name": "方法论",
      "description": "可复用的方法、流程和框架",
      "include": ["方法", "流程", "框架"],
      "exclude": ["单个项目案例"]
    }
  ]
}
```

## 设计决策

- 后端通过 `normalizeWikiSchema` 兼容旧字符串分类并统一输出对象分类。
- `wiki:updateSchema` 作为完整 Schema 保存接口，HTTP 与 Electron 共用。
- 编译器将 Schema 分类定义序列化到编译和分类审计提示词。
- 设置页先编辑本地状态，点击“保存 Schema”后一次性写入，避免逐字段产生半成品规则。
