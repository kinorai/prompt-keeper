// Mock Next.js environment variables
Object.defineProperty(process.env, "NODE_ENV", { value: "test" });
process.env.AUTH_USERNAME = "testuser";
process.env.AUTH_PASSWORD_HASH = "$2a$10$mockhashedpassword";
process.env.PROMPT_KEEPER_API_KEY = "test-api-key";
process.env.JWT_SECRET = "test-secret-key";

// Mock Next.js URL
global.URL = URL;

// Mock Headers for Next.js Request/Response
if (!global.Headers) {
  global.Headers = class Headers {
    private headers: Map<string, string>;

    constructor(init?: Record<string, string>) {
      this.headers = new Map();
      if (init) {
        Object.entries(init).forEach(([key, value]) => {
          this.set(key, value);
        });
      }
    }

    get(name: string): string | null {
      return this.headers.get(name.toLowerCase()) || null;
    }

    set(name: string, value: string): void {
      this.headers.set(name.toLowerCase(), value);
    }

    has(name: string): boolean {
      return this.headers.has(name.toLowerCase());
    }
  } as unknown as typeof globalThis.Headers;
}
