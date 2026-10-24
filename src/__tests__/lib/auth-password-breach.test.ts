import { haveIBeenPwned } from "better-auth/plugins/haveibeenpwned";

jest.mock("@/lib/prisma", () => ({ __esModule: true, default: () => ({}) }));

const loadAuth = () => {
  jest.isolateModules(() => {
    require("@/lib/auth");
  });
};

describe("password breach check", () => {
  const original = process.env.PASSWORD_BREACH_CHECK;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.PASSWORD_BREACH_CHECK;
  });

  afterAll(() => {
    // Assigning undefined to process.env stores the string "undefined"
    if (original === undefined) {
      delete process.env.PASSWORD_BREACH_CHECK;
    } else {
      process.env.PASSWORD_BREACH_CHECK = original;
    }
  });

  it("is on by default", () => {
    loadAuth();
    expect(haveIBeenPwned).toHaveBeenCalledWith({ enabled: true });
  });

  it("is off with PASSWORD_BREACH_CHECK=false", () => {
    process.env.PASSWORD_BREACH_CHECK = "false";
    loadAuth();
    expect(haveIBeenPwned).toHaveBeenCalledWith({ enabled: false });
  });
});
