/**
 * Electron 构建准备脚本
 * 将 server 和 client 构建产物复制到 electron 目录中，
 * 使 electron-builder 可以将其打包到应用的 files 中。
 * 模块解析：Node.js ESM 从 server-dist/ 向上查找 node_modules/ 自动命中。
 */
const { cp, rm } = require('fs/promises');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const electronDir = __dirname;

async function prepare() {
  // 清理旧产物
  await rm(path.join(electronDir, 'server-dist'), { recursive: true, force: true });
  await rm(path.join(electronDir, 'client-dist'), { recursive: true, force: true });

  // 复制编译后的 server
  await cp(
    path.join(rootDir, 'server', 'dist'),
    path.join(electronDir, 'server-dist'),
    { recursive: true }
  );

  // server 是 ESM（"type": "module"），必须写入 package.json 声明模块类型，
  // 否则 Node.js 会将 .js 文件当 CommonJS 解析，导致 "Cannot use import statement outside a module"
  const { writeFile } = require('fs/promises');
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
