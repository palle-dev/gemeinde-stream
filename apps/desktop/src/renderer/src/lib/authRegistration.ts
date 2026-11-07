export function normalizeAuthEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeOtpCode(value: string): string {
  return value.normalize("NFKC").replace(/\D/g, "").slice(0, 6);
}

export function validOtpCode(value: string): boolean {
  return /^\d{6}$/.test(value);
}

type RegistrationAuth<LoginResponse> = {
  verifyOtp(params: { email: string; otpCode: string }): Promise<unknown>;
  loginViaEmailPassword(email: string, password: string): Promise<LoginResponse>;
};

export async function verifyAndLoginRegistration<LoginResponse>(
  auth: RegistrationAuth<LoginResponse>,
  email: string,
  password: string,
  otpCode: string,
): Promise<LoginResponse> {
  try {
    await auth.verifyOtp({ email, otpCode });
  } catch (verificationError) {
    try {
      // OTPs are single-use. If verification succeeded on an earlier attempt but
      // a later client step failed, logging in is the reliable recovery path.
      return await auth.loginViaEmailPassword(email, password);
    } catch {
      throw verificationError;
    }
  }

  return auth.loginViaEmailPassword(email, password);
}
