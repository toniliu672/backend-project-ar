// src/interfaces/controllers/authController.ts

import { Request, Response, NextFunction } from 'express';
import { AuthUseCase } from '../../application/use-cases/auth/AuthUseCase';
import { UserRepository } from '../../infrastructure/repositories/UserRepository';
import { RefreshTokenRepository } from '../../infrastructure/repositories/RefreshTokenRepository';
import { AuthenticationError } from '../../common/error/AuthenticationError';
import { z } from 'zod';

const userRepository = new UserRepository();
const refreshTokenRepository = new RefreshTokenRepository();
const authUseCase = new AuthUseCase(userRepository, refreshTokenRepository);

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const { accessToken, refreshToken } = await authUseCase.login(email, password);
    
    // Set the access token in an HTTP-only cookie
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    // Set the refresh token in an HTTP-only cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.status(200).json({ message: 'Login successful' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: error.errors });
    } else if (error instanceof AuthenticationError) {
      res.status(401).json({ error: error.message });
    } else {
      next(error);
    }
  }
};

export const refresh = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const refreshToken = req.cookies.refreshToken;
      if (!refreshToken) {
        throw new AuthenticationError('Refresh token not found in cookies');
      }
  
      const { accessToken, refreshToken: newRefreshToken } = await authUseCase.refreshToken(refreshToken);
  
      res.cookie('accessToken', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 15 * 60 * 1000, // 15 minutes
      });
  
      res.cookie('refreshToken', newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });
  
      res.status(200).json({ message: 'Tokens refreshed successfully' });
    } catch (error) {
      console.error('Error in refresh:', error);
      if (error instanceof AuthenticationError) {
        res.status(401).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'An unexpected error occurred during token refresh' });
      }
    }
  };

export const logout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (refreshToken) {
      await authUseCase.logout(refreshToken);
    }

    res.clearCookie('accessToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });

    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          console.error('Error destroying session:', err);
        }
      });
    }

    res.status(200).json({ message: 'Logout successful' });
  } catch (error) {
    next(error);
  }
};