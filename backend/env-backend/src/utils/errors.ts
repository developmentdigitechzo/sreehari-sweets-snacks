export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'BAD_REQUEST',
    public field?: string,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Resource') => new AppError(404, `${what} not found`, 'NOT_FOUND');
export const unauthorized = (msg = 'Authentication required') => new AppError(401, msg, 'UNAUTHORIZED');
export const forbidden = (msg = 'You do not have access to this resource') => new AppError(403, msg, 'FORBIDDEN');
