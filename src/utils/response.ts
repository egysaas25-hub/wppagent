import { ApiSuccessResponse, ApiErrorResponse, PaginatedResponse } from '../types';

export class ApiResponse {
  static success<T>(
    data: T,
    message: string | null = null,
    meta: any = null
  ): ApiSuccessResponse<T> {
    return {
      success: true,
      data,
      message,
      meta,
      timestamp: new Date().toISOString(),
    };
  }

  static error(
    message: string,
    code: string = 'INTERNAL_ERROR',
    details: any = null
  ): ApiErrorResponse {
    return {
      success: false,
      error: {
        message,
        code,
        details,
      },
      timestamp: new Date().toISOString(),
    };
  }

  static paginated<T>(
    items: T[],
    pagination: {
      page: number;
      limit: number;
      total: number;
    }
  ): ApiSuccessResponse<PaginatedResponse<T>> {
    return {
      success: true,
      data: {
        items,
        total: pagination.total,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: Math.ceil(pagination.total / pagination.limit),
        hasNext: pagination.page * pagination.limit < pagination.total,
        hasPrev: pagination.page > 1,
      },
      timestamp: new Date().toISOString(),
    };
  }
}