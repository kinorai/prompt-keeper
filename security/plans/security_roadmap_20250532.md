# Prompt Keeper Security Checklist

## Authentication
- [ ] Upgrade password hashing from APR1-MD5 to bcrypt or Argon2
- [ ] Implement password complexity requirements (min length, character diversity)
- [ ] Add account lockout after 5 failed login attempts
- [ ] Implement rate limiting on authentication endpoints

## Session Management
- [ ] Verify secure cookie attributes are enabled in production:
  - `HttpOnly` (prevent XSS access)
  - `Secure` flag (HTTPS only)
  - `SameSite=Strict`
- [ ] Reduce JWT expiration from 60 days to 30 days
- [ ] Implement token revocation mechanism
- [ ] Add CSRF protection for authenticated requests

## API Security
- [ ] Validate and sanitize all API inputs
- [ ] Add rate limiting to all API endpoints
- [ ] Implement proper CORS configuration
- [ ] Add request validation middleware
- [ ] Ensure error messages don't leak sensitive information

## Environment Configuration
- [ ] Verify sensitive environment variables are NOT committed to source control:
  - `JWT_SECRET`
  - `AUTH_PASSWORD_HASH`
  - `PROMPT_KEEPER_API_KEY`
- [ ] Ensure .env is in .gitignore
- [ ] Implement secret rotation policy
- [ ] Use different secrets for development and production

## Input Validation
- [ ] Sanitize all user inputs before:
  - Storing in OpenSearch
  - Displaying in UI
  - Using in database queries
- [ ] Implement content security policy (CSP)
- [ ] Validate message content for script injection

## Dependencies
- [ ] Scan dependencies for known vulnerabilities (npm audit)
- [ ] Update vulnerable packages:
  - Check `apache-md5` for vulnerabilities
  - Verify JOSE library security
- [ ] Remove unused dependencies

## Logging and Monitoring
- [ ] Ensure passwords are never logged
- [ ] Redact sensitive data in logs
- [ ] Implement audit logging for:
  - Login attempts
  - API key usage
  - Data access
- [ ] Set up monitoring for suspicious activity

## OpenSearch Security
- [ ] Enable TLS for OpenSearch connections
- [ ] Configure proper access controls
- [ ] Encrypt data at rest
- [ ] Implement index-level security

## Frontend Security
- [ ] Sanitize Markdown rendering to prevent XSS
- [ ] Implement Content Security Policy (CSP)
- [ ] Add XSS protection headers
- [ ] Use nonces for inline scripts
