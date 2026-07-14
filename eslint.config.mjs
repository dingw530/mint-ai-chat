// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  // Global ignore — 不扫描生成目录
  { ignores: ['**/dist/**', '**/node_modules/**', '**/electron-dist/**', '**/*.cjs'] },

  // 全局推荐规则
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // 关闭与 Prettier 冲突的规则
  prettierConfig,

  // 主规则集 — 针对 server/ 的 TypeScript 代码
  {
    files: ['server/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'no-console': 'off',
      'no-undef': 'off', // tsc 已处理类型检查，ESLint no-undef 对 TS 是噪声
      'no-empty': ['error', { allowEmptyCatch: true }],
      'prefer-const': 'error',

      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-require-imports': 'off', // tsx 支持 require

      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],

      '@typescript-eslint/consistent-type-imports': ['error', {
        prefer: 'type-imports',
        fixStyle: 'separate-type-imports',
      }],

      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // 测试文件放宽规则
  {
    files: ['server/__tests__/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // 脚本文件（CommonJS 模式 tsx 脚本）
  {
    files: ['server/scripts/**/*.ts', 'scripts/**/*.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
