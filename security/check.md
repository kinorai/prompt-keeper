**Security Analysis Instruction for RooCode/Cursor AI Review**

---

# Objective:
Conduct a thorough security analysis of all code files currently open or available within the workspace. Identify any potential security vulnerabilities, bad practices, and risks. Then generate a structured output document that clearly outlines:

- Security issues found (grouped by severity: Critical, High, Medium, Low)
- The file and line number where each issue occurs
- A detailed explanation of the problem
- Recommended remediation steps
- General best practices improvements if applicable

---

# Steps for Analysis:

1. **Scan for Common Security Vulnerabilities:**
   - Injection risks (SQL Injection, Command Injection)
   - Cross-Site Scripting (XSS)
   - Cross-Site Request Forgery (CSRF)
   - Insecure Authentication & Authorization mechanisms
   - Hardcoded secrets (API keys, passwords, tokens)
   - Unsafe deserialization
   - Insecure file uploads
   - Improper error handling / verbose error messages
   - Use of outdated or vulnerable dependencies
   - Unvalidated or unsanitized input handling
   - Missing security headers (for web apps)
   - Improper use of cryptographic functions (weak algorithms, incorrect usage)
   - Excessive permissions (least privilege violations)
   - Information leakage (exposing internal structure or sensitive info)

2. **Code Quality & Practice Review:**
   - Check for lack of input/output validation
   - Review logging practices (ensure no sensitive data is logged)
   - Review session management and token expiry
   - Analyze access control at critical operation points
   - Check for open redirect vulnerabilities

3. **Dependency & Configuration Review:**
   - Flag outdated libraries
   - Flag libraries known to have CVEs (Common Vulnerabilities and Exposures)
   - Check configuration files for misconfigurations (e.g., debug mode on, unrestricted CORS)

---

# Output Format:

## 1. Executive Summary
- Total number of issues found
- Breakdown by severity (Critical / High / Medium / Low)

## 2. Detailed Findings
For each issue:

- **Severity:** (Critical / High / Medium / Low)
- **File:** path/to/file.ext
- **Line Number:** 123
- **Issue Summary:** Short description
- **Detailed Explanation:**
  > In-depth explanation of why this is a security concern.
- **Recommended Fix:**
  > Step-by-step recommendation to remediate the issue.
- **Best Practice Note (if applicable):**
  > Suggested improvement even if not directly a security flaw.

## 3. Dependency and Configuration Issues
- List of outdated or vulnerable libraries
- Misconfigurations found
- Recommendations

## 4. General Recommendations
- High-level suggestions to improve overall project security posture (e.g., setting up automated security scanning, upgrading dependency management processes, implementing security headers globally, etc.)

---

# Important Notes:
- Prioritize Critical and High severity issues for immediate attention.
- Medium severity issues should be included in upcoming development cycles.
- Low severity and best practices can be progressively addressed.
- Use CVSS (Common Vulnerability Scoring System) scores to prioritize where possible.
- Highlight any systemic patterns that increase risk (e.g., recurring lack of input validation).

---

# Output File Name:

`security_analysis_report_[date].md`

---

**End of Analysis Instructions**
