export class ServiceError extends Error {
  constructor(public readonly code: string, public readonly statusCode: number, message: string) {
    super(message);
    this.name = 'ServiceError';
  }
}
export const unavailable = () => new ServiceError('LIBRETV_UNAVAILABLE', 503, 'LibreTV is unavailable');
export const invalidResponse = () => new ServiceError('LIBRETV_INVALID_RESPONSE', 502, 'LibreTV returned an incompatible response');
