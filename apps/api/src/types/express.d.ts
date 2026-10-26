declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth for authenticated requests. */
      userId?: string;
    }
  }
}

export {};
