import { A2uiMessageSchema, MessageProcessor, type Catalog, type ComponentApi, type SurfaceModel } from '@a2ui/web_core/v0_9';
import type { ReactComponentImplementation } from '@a2ui/react/v0_9';

export type A2uiMessage = typeof A2uiMessageSchema._type;
export type A2uiCatalog = Catalog<ReactComponentImplementation>;
export type A2uiSurfaceModel = SurfaceModel<ReactComponentImplementation>;

/** 解析并校验官方 A2UI v0.9 消息，拒绝自定义扁平 envelope。 */
export function parseA2uiMessage(raw: string): A2uiMessage | null {
  try {
    const result = A2uiMessageSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** 创建官方 A2UI processor；Surface、组件树和 Data Model 均由官方模型管理。 */
export function createA2uiProcessor(catalog: A2uiCatalog): MessageProcessor<ReactComponentImplementation> {
  return new MessageProcessor<ReactComponentImplementation>([catalog]);
}

/** 将自定义 Catalog API 约束为官方 ComponentApi，避免业务组件绕过 Catalog 注册。 */
export function createMintComponentApi<Schema extends ComponentApi['schema']>(name: string, schema: Schema): ComponentApi<Schema> {
  return { name, schema };
}
