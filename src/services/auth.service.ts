import jwt from 'jsonwebtoken';
import config from '../config/environment';
import UserModel from '../models/user.model';
import { AuthenticationError } from '../utils/errors';
import logger from '../config/logger';
import {
  CreateUserDTO,
  AuthResponse,
  LoginDTO,
  UserPayload
} from '../types';

class AuthService {
  /**
   * Register a new user
   */
  static async register(userData: CreateUserDTO): Promise<AuthResponse> {
    logger.info('Registering new user', { email: userData.email, role: userData.role });

    const user = await UserModel.create(userData);

    const token = this.generateToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as any,
    });

    logger.info('User registered successfully', { userId: user.id });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role as any,
      },
      token,
    };
  }

  /**
   * Login user
   */
  static async login(credentials: LoginDTO): Promise<AuthResponse> {
    const { email, password } = credentials;
    
    logger.info('Login attempt', { email });

    const user = await UserModel.verifyPassword(email, password);

    if (!user) {
      logger.warn('Login failed - invalid credentials', { email });
      throw new AuthenticationError('Invalid email or password');
    }

    if (user.status !== 'active') {
      logger.warn('Login failed - inactive account', { email });
      throw new AuthenticationError('Account is inactive');
    }

    const token = this.generateToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as any,
    });

    logger.info('User logged in successfully', { userId: user.id });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role as any,
      },
      token,
    };
  }

  /**
   * Generate JWT token
   */
  static generateToken(user: UserPayload): string {
    return jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      config.jwt.secret,
      {
        expiresIn: config.jwt.expiresIn,
      }
    );
  }

  /**
   * Change password
   */
  static async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string
  ): Promise<{ message: string }> {
    const user = UserModel.findById(userId);

    if (!user) {
      throw new AuthenticationError('User not found');
    }

    const verified = await UserModel.verifyPassword(user.email, oldPassword);

    if (!verified) {
      throw new AuthenticationError('Current password is incorrect');
    }

    await UserModel.updatePassword(userId, newPassword);

    logger.info('Password changed successfully', { userId });

    return { message: 'Password changed successfully' };
  }
}

export default AuthService;