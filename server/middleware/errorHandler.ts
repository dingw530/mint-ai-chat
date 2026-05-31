import { Request, Response, NextFunction } from 'express';
import { HttpError } from '../types.js';

// 全局错误处理中间件：捕获所有未处理的异常，返回统一的 JSON 错误格式
export function errorHandler(err: HttpError, _req: Request, res: Response, _next: NextFunction): void {
  console.error('Unhandled error:', err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'Internal Server Error',
  });
}
