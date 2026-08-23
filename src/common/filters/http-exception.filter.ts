import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  timestamp: string;
  path: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = isHttpException ? exception.getResponse() : null;
    const message = this.extractMessage(exceptionResponse, statusCode);

    if (!isHttpException) {
      this.logger.error('Unhandled application exception');
    }

    const body: ErrorResponse = {
      statusCode,
      message,
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
    };

    response.status(statusCode).json(body);
  }

  private extractMessage(
    exceptionResponse: string | object | null,
    statusCode: number,
  ): string | string[] {
    if (typeof exceptionResponse === 'string') return exceptionResponse;

    if (exceptionResponse && 'message' in exceptionResponse) {
      const message = (exceptionResponse as { message?: unknown }).message;
      if (typeof message === 'string') return message;
      if (
        Array.isArray(message) &&
        message.every((item) => typeof item === 'string')
      ) {
        return message;
      }
    }

    return statusCode === Number(HttpStatus.INTERNAL_SERVER_ERROR)
      ? 'Internal server error'
      : 'Request failed';
  }
}
