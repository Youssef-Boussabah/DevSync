import type { NestApplicationOptions } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ErrorRequestHandler } from 'express';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { validationFailed } from './common/api-error';

/**
 * How the HTTP application is put together, in one function that the process
 * bootstrap and the integration tests both call.
 *
 * Splitting these settings between `main.ts` and a test would mean the suite
 * exercising an application configured differently from the one that runs —
 * which is exactly how a body limit or an error shape ends up proved nowhere.
 */

/**
 * 1 MiB. Express defaults to 100 kB, which is small for a source file, and this
 * is a boundary against a malformed or accidental upload rather than a quota:
 * there is no per-project size limit, no file-count limit, and no accounting.
 */
export const JSON_BODY_LIMIT_BYTES = 1_048_576;

/** How that limit is described to a client that exceeded it. */
export const JSON_BODY_LIMIT_DESCRIPTION = '1 MiB';

/**
 * Nest's own JSON parser is switched off so there is exactly one, with one limit.
 * Left on, its 100 kB parser would sit in front of the one below and the larger
 * limit would never be reached.
 */
export const HTTP_APPLICATION_OPTIONS: NestApplicationOptions = { bodyParser: false };

export function configureHttpApplication(app: NestExpressApplication): void {
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT_BYTES });

  // Immediately after the parser, so it is the next error handler Express reaches
  // when parsing fails.
  app.use(unreadableBody);

  // Before `listen`. Nest installs its router hooks during initialisation and
  // reads the global filters as it does, so a filter registered afterwards would
  // never see an error raised outside a route handler.
  app.useGlobalFilters(new ApiExceptionFilter());
}

/**
 * A body Express could not turn into JSON: malformed, or larger than the limit.
 *
 * Both are the client having sent something DevSync cannot read, so both are
 * `400` and `VALIDATION_FAILED` rather than the parser's own `413` and its own
 * body. This has to run here rather than in the exception filter because Nest
 * rewrites a parser's `SyntaxError` into its own `BadRequestException`, message
 * and all, before any filter is consulted.
 *
 * Matched on the `type` the body parser sets, because importing `http-errors` to
 * name a class would be a dependency added to recognise two strings.
 */
const unreadableBody: ErrorRequestHandler = (error, _request, _response, next) => {
  const message = describeUnreadableBody(error);

  next(message === undefined ? error : validationFailed(message, { cause: error }));
};

function describeUnreadableBody(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('type' in error)) {
    return undefined;
  }

  const { type } = error;

  if (type === 'entity.parse.failed') {
    return 'The request body is not valid JSON.';
  }

  if (type === 'entity.too.large') {
    return `The request body is larger than the ${JSON_BODY_LIMIT_DESCRIPTION} limit.`;
  }

  return undefined;
}
