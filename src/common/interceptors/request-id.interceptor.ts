import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { Request, Response } from 'express';

export interface RequestWithId extends Request {
  requestId?: string;
  user?: any;
  admin?: any;
}

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest<RequestWithId>();
    const res = http.getResponse<Response>();

    const reqId = (req.headers['x-request-id'] as string) || uuidv4();
    req.requestId = reqId;
    res.setHeader('X-Request-Id', reqId);

    return next.handle();
  }
}
