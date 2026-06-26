/**
 * Electron 构建准备脚本
 *
 * esbuild 将 server 打包为单一 ESM 文件（index.js），JS 依赖全部内联。
 * 此脚本仅需拷贝：
 *   1. 原生模块（better-sqlite3、pdfjs-dist）→ electron/node_modules/
 *   2. server 编译产物 → electron/server-dist/
 *   3. client 构建产物 → electron/client-dist/
 */
const { cp, rm, readFile, writeFile, access } = require('fs/promises');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const electronDir = __dirname;

// 仅原生/WASM 模块需要从 node_modules 拷贝
const NATIVE_MODULES = ['better-sqlite3', 'pdfjs-dist'];

async function copyNativeModules() {
  const rootNm = path.join(rootDir, 'node_modules');
  const electronNm = path.join(electronDir, 'node_modules');

  // 清理旧 node_modules，确保不残留已移除的依赖
  await rm(electronNm, { recursive: true, force: true });
  await access(rootNm); // ensure root node_modules exists

  let copied = 0;
  for (const mod of NATIVE_MODULES) {
    const src = path.join(rootNm, mod);
    const dest = path.join(electronNm, mod);
    try {
      await access(src);
      await cp(src, dest, { recursive: true });
      copied++;
    } catch {
      console.warn(`⚠ Skipping ${mod}: not found in node_modules`);
    }
  }
  console.log(`✓ Copied ${copied}/${NATIVE_MODULES.length} native modules`);
}

async function prepare() {
  // 拷贝原生模块（先清理旧 node_modules）
  await copyNativeModules();

  // 清理旧产物
  await rm(path.join(electronDir, 'server-dist'), { recursive: true, force: true });
  await rm(path.join(electronDir, 'client-dist'), { recursive: true, force: true });

  // 复制 server 编译产物（esbuild bundle）
  await cp(
    path.join(rootDir, 'server', 'dist'),
    path.join(electronDir, 'server-dist'),
    { recursive: true }
  );

  // server 是 ESM，必须写入 package.json 声明模块类型
  await writeFile(
    path.join(electronDir, 'server-dist', 'package.json'),
    JSON.stringify({ type: 'module' }) + '\n',
    'utf-8'
  );

  // 复制构建后的 client
  await cp(
    path.join(rootDir, 'client', 'dist'),
    path.join(electronDir, 'client-dist'),
    { recursive: true }
  );

  console.log('✓ Electron build prepared (server-dist, client-dist)');
}

prepare().catch((err) => {
  console.error('Prepare failed:', err);
  process.exit(1);
});
