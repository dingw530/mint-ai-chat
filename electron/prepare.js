/**
 * Electron 构建准备脚本
 * 将 server 和 client 构建产物复制到 electron 目录中，
 * 使 electron-builder 可以将其打包到应用的 files 中。
 *
 * 依赖处理：从 server/node_modules/ 递归拷贝所有运行时依赖（含传递依赖）
 * 到 electron/node_modules/，确保打包后不会报 ERR_MODULE_NOT_FOUND。
 */
const { cp, rm, readFile, writeFile, access } = require('fs/promises');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const electronDir = __dirname;

/**
 * 从 server/node_modules/ 递归拷贝所有运行时依赖到 electron/node_modules/
 */
async function syncServerDeps() {
  const serverPkg = JSON.parse(await readFile(path.join(rootDir, 'server', 'package.json'), 'utf-8'));
  const serverNm = path.join(rootDir, 'server', 'node_modules');
  const electronNm = path.join(electronDir, 'node_modules');

  // BFS 收集所有需要拷贝的包（含传递依赖）
  const toCopy = new Set();
  const queue = Object.keys(serverPkg.dependencies);

  while (queue.length > 0) {
    const dep = queue.pop();
    if (toCopy.has(dep)) continue;
    toCopy.add(dep);

    // 读取该包的 package.json 获取传递依赖
    try {
      let pkgPath;
      if (dep.startsWith('@')) {
        const [scope, name] = dep.split('/');
        pkgPath = path.join(serverNm, scope, name, 'package.json');
      } else {
        pkgPath = path.join(serverNm, dep, 'package.json');
      }
      const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
      for (const transitive of Object.keys(pkg.dependencies || {})) {
        if (!toCopy.has(transitive)) queue.push(transitive);
      }
    } catch {
      // 包不存在或无法解析，跳过
    }
  }

  // 拷贝所有收集到的包
  let copied = 0;
  for (const dep of toCopy) {
    const src = dep.startsWith('@')
      ? path.join(serverNm, dep.split('/')[0], dep.split('/')[1])
      : path.join(serverNm, dep);
    const dest = dep.startsWith('@')
      ? path.join(electronNm, dep.split('/')[0], dep.split('/')[1])
      : path.join(electronNm, dep);
    try {
      await access(src);
      await rm(dest, { recursive: true, force: true });
      await cp(src, dest, { recursive: true });
      copied++;
    } catch {
      console.warn(`⚠ Skipping ${dep}: not found in server/node_modules`);
    }
  }
  console.log(`✓ Synced ${copied}/${toCopy.size} packages (including transitive deps)`);
}

async function prepare() {
  // 同步 server 运行时依赖（含传递依赖）
  await syncServerDeps();

  // 清理旧产物
  await rm(path.join(electronDir, 'server-dist'), { recursive: true, force: true });
  await rm(path.join(electronDir, 'client-dist'), { recursive: true, force: true });

  // 复制编译后的 server
  await cp(
    path.join(rootDir, 'server', 'dist'),
    path.join(electronDir, 'server-dist'),
    { recursive: true }
  );

  // server 是 ESM（"type": "module"），必须写入 package.json 声明模块类型
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
