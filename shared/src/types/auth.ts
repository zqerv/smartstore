import type { Decimal } from "@prisma/client/runtime/library";
import type { UserRole } from "./common";

export type Price = Decimal;

export interface AuthUser {
  id: string;
  email?: string;
  phone?: string;
  role: UserRole;
  storeId?: string;
  accessToken?: string;
}

export interface JWTPayload {
  userId: string;
  role: UserRole;
  storeId?: string;
  email?: string;
}

export interface LoginRequest {
  phone?: string;
  email?: string;
  password: string;
  storeId?: string;
}

export interface LoginResponse {
  user: AuthUser;
  token: string;
  refreshToken?: string;
}

export interface RegisterRequest {
  phone: string;
  email?: string;
  password: string;
  storeId?: string;
  firstName?: string;
  lastName?: string;
}

export interface RegisterResponse {
  success: boolean;
  message: string;
  verificationCode?: string;
}

export interface VerifyOTPRequest {
  phone: string;
  code: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

export interface UpdatePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface SessionData {
  userId: string;
  role: UserRole;
  storeId?: string;
  token: string;
}

export interface RefreshToken {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}