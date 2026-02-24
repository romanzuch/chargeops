export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly type: string;
  abstract readonly title: string;
  readonly detail?: string;

  protected constructor(message: string, detail?: string) {
    super(message);
    this.name = this.constructor.name;
    this.detail = detail ?? message;
  }
}

/**
 * Use when the request is syntactically valid but semantically invalid.
 *
 * Examples:
 * - Business rule violations
 * - Invalid state transitions
 */

export class BadRequestError extends AppError {
  readonly statusCode = 400;
  readonly type = "https://errors.chargeops.dev/bad-request";
  readonly title = "Bad Request";
  public constructor(message: string, detail?: string) {
    super(message, detail);
  }
}

export class UnauthorizedError extends AppError {
  readonly statusCode = 401;
  readonly type = "https://errors.chargeops.dev/unauthorized";
  readonly title = "Unauthorized";
  public constructor(message: string, detail?: string) {
    super(message, detail);
  }
}

export class ForbiddenError extends AppError {
  /**
   * The caller is authenticated but not allowed to perform the operation.
   */
  readonly statusCode = 403;
  readonly type = "https://errors.chargeops.dev/forbidden";
  readonly title = "Forbidden";
  public constructor(message: string, detail?: string) {
    super(message, detail);
  }
}

export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly type = "https://errors.chargeops.dev/not-found";
  readonly title = "Not Found";
  public constructor(message: string, detail?: string) {
    super(message, detail);
  }
}

export class ConflictError extends AppError {
  readonly statusCode = 409;
  readonly type = "https://errors.chargeops.dev/conflict";
  readonly title = "Conflict";
  public constructor(message: string, detail?: string) {
    super(message, detail);
  }
}

export class InternalServerError extends AppError {
  readonly statusCode = 500;
  readonly type = "https://errors.chargeops.dev/internal";
  readonly title = "Internal Server Error";
  public constructor(message: string, detail?: string) {
    super(message, detail);
  }
}
