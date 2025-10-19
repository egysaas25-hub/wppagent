import db from '../config/database';
import { Encryption } from '../utils/encryption';
import { ConflictError, NotFoundError } from '../utils/errors';
import { v4 as uuidv4 } from 'uuid';
import {
  User,
  UserWithPassword,
  CreateUserDTO,
  UpdateUserDTO,
  UserRole,
  UserStatus,
  PaginationQuery
} from '../types';

class UserModel {
  /**
   * Create a new user
   */
  static async create(userData: CreateUserDTO): Promise<User> {
    const { email, password, name, role = UserRole.AGENT } = userData;

    // Check if user already exists
    const existing = this.findByEmail(email);
    if (existing) {
      throw new ConflictError('User with this email already exists');
    }

    // Hash password
    const passwordHash = await Encryption.hashPassword(password);
    const id = uuidv4();

    db.prepare(`
      INSERT INTO users (id, email, password_hash, name, role)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, email, passwordHash, name, role);

    return this.findById(id)!;
  }

  /**
   * Find user by ID
   */
  static findById(id: string): User | undefined {
    const user = db.prepare(`
      SELECT id, email, name, role, status, created_at, updated_at
      FROM users
      WHERE id = ?
    `).get(id) as User | undefined;

    return user;
  }

  /**
   * Find user by email
   */
  static findByEmail(email: string, includePassword: boolean = false): User | UserWithPassword | undefined {
    if (includePassword) {
      return db.prepare(`
        SELECT id, email, password_hash, name, role, status, created_at, updated_at
        FROM users
        WHERE email = ?
      `).get(email) as UserWithPassword | undefined;
    }

    return db.prepare(`
      SELECT id, email, name, role, status, created_at, updated_at
      FROM users
      WHERE email = ?
    `).get(email) as User | undefined;
  }

  /**
   * Get all users with pagination
   */
  static findAll(options: PaginationQuery & { role?: UserRole; status?: UserStatus }): {
    users: User[];
    total: number;
  } {
    const { page = 1, limit = 50, role, status } = options;
    const offset = (page - 1) * limit;
    
    let query = 'SELECT id, email, name, role, status, created_at, updated_at FROM users WHERE 1=1';
    const params: any[] = [];

    if (role) {
      query += ' AND role = ?';
      params.push(role);
    }

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const users = db.prepare(query).all(...params) as User[];

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM users WHERE 1=1';
    const countParams: any[] = [];

    if (role) {
      countQuery += ' AND role = ?';
      countParams.push(role);
    }

    if (status) {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }

    const { total } = db.prepare(countQuery).get(...countParams) as { total: number };

    return { users, total };
  }

  /**
   * Update user
   */
  static update(id: string, updates: UpdateUserDTO): User {
    const user = this.findById(id);
    if (!user) {
      throw new NotFoundError('User');
    }

    const allowedUpdates: (keyof UpdateUserDTO)[] = ['name', 'role', 'status'];
    const setClauses: string[] = [];
    const params: any[] = [];

    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key as keyof UpdateUserDTO)) {
        setClauses.push(`${key} = ?`);
        params.push(updates[key as keyof UpdateUserDTO]);
      }
    });

    if (setClauses.length === 0) {
      return user;
    }

    setClauses.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    db.prepare(`
      UPDATE users
      SET ${setClauses.join(', ')}
      WHERE id = ?
    `).run(...params);

    return this.findById(id)!;
  }

  /**
   * Update password
   */
  static async updatePassword(id: string, newPassword: string): Promise<User> {
    const passwordHash = await Encryption.hashPassword(newPassword);

    db.prepare(`
      UPDATE users
      SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(passwordHash, id);

    return this.findById(id)!;
  }

  /**
   * Delete user (soft delete)
   */
  static delete(id: string): boolean {
    const result = db.prepare(`
      UPDATE users
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(UserStatus.INACTIVE, id);

    return result.changes > 0;
  }

  /**
   * Verify password
   */
  static async verifyPassword(email: string, password: string): Promise<User | null> {
    const user = this.findByEmail(email, true) as UserWithPassword | undefined;
    
    if (!user) {
      return null;
    }

    const isValid = await Encryption.comparePassword(password, user.password_hash);
    
    if (!isValid) {
      return null;
    }

    // Return user without password hash
    const { password_hash, ...userWithoutPassword } = user;
    return userWithoutPassword as User;
  }
}

export default UserModel;