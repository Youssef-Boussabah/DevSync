import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { isPersistenceError } from '@devsync/database';
import { ApiError, fromPersistenceError, internalError, toApiErrorResource } from './api-error';

/**
 * The one place a failure becomes a response.
 *
 * Nest's default error body is `{ statusCode, message, error }`, which carries no
 * stable code and, for an unexpected exception, whatever the exception said. This
 * replaces it with the shared error resource for everything DevSync raises, and
 * leaves the rest to the framework.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof ApiError) {
      this.write(response, exception);
      return;
    }

    // A persistence failure no service interpreted. The mapping is the one a
    // service would have applied; it is here as well so that no route can leak an
    // unhandled data-layer error by forgetting to catch one.
    if (isPersistenceError(exception)) {
      this.write(response, fromPersistenceError(exception));
      return;
    }

    if (exception instanceof HttpException) {
      // Raised by the framework for requests that never reach a DevSync route —
      // an unmatched path, an unsupported method. There is no stable code that
      // describes those, and inventing one would grow the contract for failures
      // no client of this API can legitimately provoke, so the framework's own
      // body is left alone.
      this.writeFrameworkResponse(response, exception);
      return;
    }

    this.write(response, internalError(exception));
  }

  private write(response: Response, error: ApiError): void {
    this.report(error);
    response.status(error.statusCode).json(toApiErrorResource(error));
  }

  private writeFrameworkResponse(response: Response, exception: HttpException): void {
    const status = exception.getStatus();
    const body = exception.getResponse();

    response
      .status(status)
      .json(typeof body === 'string' ? { statusCode: status, message: body } : body);
  }

  /**
   * Anything the server is answerable for is logged with the real exception
   * behind it. Nothing below that is: a rejected request is the client's news
   * rather than an incident, and logging one per bad request is how a log stops
   * being read.
   */
  private report(error: ApiError): void {
    if (error.statusCode < HttpStatus.INTERNAL_SERVER_ERROR) {
      return;
    }

    const { cause } = error;

    if (cause instanceof Error) {
      this.logger.error(`${error.code}: ${cause.message}`, cause.stack);
      return;
    }

    this.logger.error(`${error.code}: ${error.message}`);
  }
}
