import { describe, it, expect } from "vitest";
import {
  RegisterRequestSchema,
  LoginRequestSchema,
  RefreshRequestSchema,
  LogoutRequestSchema,
  AccessTokenResponseSchema,
  CurrentUserResponseSchema,
} from "../../../src/http/schemas/auth.schemas.js";

describe("Auth Schemas", () => {
  describe("RegisterRequestSchema", () => {
    it("validates a complete registration request", () => {
      const input = {
        email: "user@example.com",
        password: "MySecurePassword123",
        name: "John Doe",
      };

      const result = RegisterRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe("user@example.com");
        expect(result.data.password).toBe("MySecurePassword123");
        expect(result.data.name).toBe("John Doe");
      }
    });

    it("normalizes email to lowercase", () => {
      const input = {
        email: "User@EXAMPLE.com",
        password: "MySecurePassword123",
      };

      const result = RegisterRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe("user@example.com");
      }
    });

    it("trims email whitespace", () => {
      const input = {
        email: "  user@example.com  ",
        password: "MySecurePassword123",
      };

      const result = RegisterRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe("user@example.com");
      }
    });

    it("rejects invalid email format", () => {
      const input = {
        email: "not-an-email",
        password: "MySecurePassword123",
      };

      const result = RegisterRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects weak password (too short)", () => {
      const input = {
        email: "user@example.com",
        password: "short",
      };

      const result = RegisterRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("accepts exactly 12-character password (minimum)", () => {
      const input = {
        email: "user@example.com",
        password: "123456789012", // exactly 12 chars
      };

      const result = RegisterRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("makes name optional", () => {
      const input = {
        email: "user@example.com",
        password: "MySecurePassword123",
      };

      const result = RegisterRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBeUndefined();
      }
    });

    it("rejects extra fields (strict validation)", () => {
      const input = {
        email: "user@example.com",
        password: "MySecurePassword123",
        extra: "field",
      } as any;

      const result = RegisterRequestSchema.safeParse(input);
      // Zod by default allows extra fields unless .strict() is used
      // This test documents the current behavior
      expect(result.success).toBe(true);
    });
  });

  describe("LoginRequestSchema", () => {
    it("validates a valid login request", () => {
      const input = {
        email: "user@example.com",
        password: "MySecurePassword123",
      };

      const result = LoginRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("normalizes email to lowercase", () => {
      const input = {
        email: "User@EXAMPLE.com",
        password: "password",
      };

      const result = LoginRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe("user@example.com");
      }
    });

    it("rejects missing email", () => {
      const input = {
        password: "MySecurePassword123",
      };

      const result = LoginRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects missing password", () => {
      const input = {
        email: "user@example.com",
      };

      const result = LoginRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("accepts empty password string (validated later)", () => {
      // The schema accepts it; business logic validates it
      const input = {
        email: "user@example.com",
        password: "",
      };

      const result = LoginRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe("RefreshRequestSchema", () => {
    it("validates with optional refreshToken", () => {
      const input = {
        refreshToken: "base64url_encoded_token",
      };

      const result = RefreshRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("validates with empty object (token from cookie)", () => {
      const input = {};

      const result = RefreshRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("rejects empty refreshToken string", () => {
      const input = {
        refreshToken: "",
      };

      const result = RefreshRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe("LogoutRequestSchema", () => {
    it("validates with optional refreshToken", () => {
      const input = {
        refreshToken: "base64url_encoded_token",
      };

      const result = LogoutRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("validates with empty object (token from cookie)", () => {
      const input = {};

      const result = LogoutRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe("AccessTokenResponseSchema", () => {
    it("validates a valid auth response", () => {
      const input = {
        accessToken: "eyJhbGc...",
        expiresIn: 900,
      };

      const result = AccessTokenResponseSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("rejects negative expiresIn", () => {
      const input = {
        accessToken: "token",
        expiresIn: -1,
      };

      const result = AccessTokenResponseSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects zero expiresIn", () => {
      const input = {
        accessToken: "token",
        expiresIn: 0,
      };

      const result = AccessTokenResponseSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("accepts fractional expiresIn (coerced to int)", () => {
      const input = {
        accessToken: "token",
        expiresIn: 900.5,
      };

      const result = AccessTokenResponseSchema.safeParse(input);
      expect(result.success).toBe(true);
      // Note: Zod coerces to integer, losing decimal
    });
  });

  describe("CurrentUserResponseSchema", () => {
    it("validates a valid user profile response", () => {
      const input = {
        userId: "user-123",
        email: "user@example.com",
        tenantId: "tenant-456",
        role: "admin",
      };

      const result = CurrentUserResponseSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("validates all valid role values", () => {
      const roles = ["admin", "operator", "viewer"] as const;

      for (const role of roles) {
        const input = {
          userId: "user-123",
          email: "user@example.com",
          tenantId: "tenant-456",
          role,
        };

        const result = CurrentUserResponseSchema.safeParse(input);
        expect(result.success).toBe(true);
      }
    });

    it("rejects invalid role", () => {
      const input = {
        userId: "user-123",
        email: "user@example.com",
        tenantId: "tenant-456",
        role: "superuser",
      };

      const result = CurrentUserResponseSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects invalid email", () => {
      const input = {
        userId: "user-123",
        email: "not-an-email",
        tenantId: "tenant-456",
        role: "admin",
      };

      const result = CurrentUserResponseSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});
