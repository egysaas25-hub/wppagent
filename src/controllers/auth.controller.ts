import { Request, Response } from 'express';
import AuthService from '../services/auth.service';
import { ApiResponse } from '../utils/response';
import { asyncHandler } from '../middleware/errorHandler.middleware';
import { CreateUserDTO, LoginDTO } from '../types';

class AuthController {
  /**
   * Register new user
   * POST /auth/register
   */
  static register = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userData: CreateUserDTO = req.body;

    const result = await AuthService.register(userData);

    res.status(201).json(
      ApiResponse.success(result, 'User registered successfully')
    );
  });

  /**
   * Login user
   * POST /auth/login
   */
  static login = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const credentials: LoginDTO = req.body;

    const result = await AuthService.login(credentials);

    res.json(
      ApiResponse.success(result, 'Login successful')
    );
  });

  /**
   * Get current user
   * GET /auth/me
   */
  static getCurrentUser = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(
      ApiResponse.success({ user: req.user })
    );
  });

  /**
   * Change password
   * POST /auth/change-password
   */
  static changePassword = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user!.id;

    const result = await AuthService.changePassword(userId, oldPassword, newPassword);

    res.json(
      ApiResponse.success(result, 'Password changed successfully')
    );
  });

  /**
   * Logout
   * POST /auth/logout
   */
  static logout = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(
      ApiResponse.success(null, 'Logged out successfully')
    );
  });
}

export default AuthController;