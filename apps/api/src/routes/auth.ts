import { loginSchema, profileSchema, recoverySchema, registerSchema } from '@pet-care-tracker/core';
import type { FastifyInstance } from 'fastify';
import {
  createSession,
  EmailTakenError,
  findUserByEmail,
  householdsFor,
  isKnownTimeZone,
  registerUser,
  revokeAllSessions,
  revokeSession,
  SESSION_COOKIE,
  SESSION_DAYS,
  updateProfile,
  useRecoveryCode,
  verifyPassword,
} from '../domain/auth';
import { type AppContext, requireAuth } from '../http/context';
import { ApiError, badRequest } from '../http/errors';

const invalidCredentials = () =>
  new ApiError(401, 'invalid_credentials', 'email or password is wrong');

function sessionCookieOptions(context: AppContext) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: context.config.isProduction,
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  };
}

export function registerAuthRoutes(app: FastifyInstance, context: AppContext): void {
  app.post('/auth/register', async (request, reply) => {
    const input = registerSchema.parse(request.body);

    try {
      const created = await registerUser(context.database, { ...input, now: context.now() });
      const { token } = createSession(context.database, {
        userId: created.userId,
        userAgent: request.headers['user-agent'],
        now: context.now(),
      });

      reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions(context));
      return reply.status(201).send({
        userId: created.userId,
        householdId: created.householdId,
        // Shown once and never again: there is no mail service to send a reset link.
        recoveryCode: created.recoveryCode,
      });
    } catch (error) {
      if (error instanceof EmailTakenError) {
        throw new ApiError(409, 'email_taken', 'that email is already registered');
      }
      throw error;
    }
  });

  app.post(
    '/auth/login',
    {
      // Slow down guessing without locking anyone out of their own account.
      config: { rateLimit: { max: 10, timeWindow: '5 minutes' } },
    },
    async (request, reply) => {
      const input = loginSchema.parse(request.body);
      const user = findUserByEmail(context.database, input.email);

      // Hash a dummy value when the account is unknown, so a missing account and a wrong
      // password take the same time and cannot be told apart.
      const stored = user?.passwordHash ?? '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$aaaa';
      const matches = await verifyPassword(stored, input.password);
      if (!user || !matches) throw invalidCredentials();

      const { token } = createSession(context.database, {
        userId: user.id,
        userAgent: request.headers['user-agent'],
        now: context.now(),
      });

      reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions(context));
      return { userId: user.id };
    },
  );

  app.post('/auth/logout', async (request, reply) => {
    if (request.auth) revokeSession(context.database, request.auth.sessionId);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/auth/me', async (request) => {
    const { user } = requireAuth(request);
    const memberships = householdsFor(context.database, user.id);

    return {
      user,
      households: memberships.map((membership) => ({
        id: membership.household.id,
        name: membership.household.name,
        role: membership.role,
        reminderLeadDays: membership.household.reminderLeadDays,
        reminderHour: membership.household.reminderHour,
      })),
    };
  });

  app.post(
    '/auth/recovery',
    { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (request) => {
      const input = recoverySchema.parse(request.body);
      const recovered = await useRecoveryCode(context.database, input);
      if (!recovered) throw invalidCredentials();
      return { ok: true };
    },
  );

  app.delete('/auth/sessions', async (request, reply) => {
    const { user } = requireAuth(request);
    revokeAllSessions(context.database, user.id);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.patch('/auth/me', async (request) => {
    const { user } = requireAuth(request);
    const input = profileSchema.parse(request.body);

    if (input.timeZone !== undefined && !isKnownTimeZone(input.timeZone)) {
      throw badRequest('validation_failed', 'unknown time zone', {
        fields: [{ path: 'timeZone', message: 'not an IANA time zone' }],
      });
    }

    const updated = updateProfile(context.database, user.id, input);
    return { user: updated };
  });
}
