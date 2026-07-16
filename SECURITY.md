# Security Policy

## Supported versions

AetherGlobe is maintained from the `main` branch. Security fixes are applied to the latest code on `main` and to the most recent published release, when releases are available.

| Version | Supported |
|---|---|
| Latest `main` / latest release | Yes |
| Older commits and releases | No |

## Reporting a vulnerability

Please do not disclose suspected vulnerabilities in a public issue, discussion, pull request, or social-media post.

Use GitHub's **Report a vulnerability** option in the repository Security tab when it is available. If private vulnerability reporting is unavailable, contact the repository owner through their GitHub profile. As a last resort, open a public issue titled **Private security contact requested** without including technical details, credentials, reproduction steps, logs, or exploit information.

Include the following information in a private report when possible:

- The affected version, commit, route, component, or configuration
- A clear description of the impact
- Minimal reproduction steps or a proof of concept
- Relevant logs with credentials, tokens, personal data, and private URLs removed
- Any suggested mitigation or patch

Never include live API keys, Firebase credentials, session tokens, personal data, or other secrets in a report. Revoke or rotate an exposed credential immediately.

## Response targets

The maintainer will aim to:

- Acknowledge a report within 3 business days
- Provide an initial assessment within 7 business days
- Share progress updates at least every 14 days while remediation is active
- Coordinate disclosure after a fix is available

These are response targets rather than guaranteed service-level agreements.

## Scope

Examples of issues that are in scope include:

- Exposure or misuse of server-side credentials
- Authentication or authorization bypasses
- Firestore security-rule weaknesses
- Injection, request-validation, or server-side request vulnerabilities
- Cross-site scripting or sensitive-data exposure
- Dependency or build-pipeline compromise
- Rate-limit bypasses that create meaningful security or cost impact

The following are generally out of scope unless they create a separate security impact:

- Inaccurate, delayed, or unavailable third-party weather, flight, map, earthquake, or AI data
- Expected AI-model errors or hallucinations
- Denial-of-service testing, traffic flooding, or destructive load testing
- Social engineering, physical attacks, or attacks against third-party providers
- Findings that require access to already-compromised credentials

## Safe harbor

Good-faith security research is welcome when it:

- Avoids privacy violations, data destruction, service disruption, and excessive automated traffic
- Uses only the minimum access necessary to demonstrate the issue
- Does not retain, share, or exploit accessed data
- Allows reasonable time for investigation and remediation before public disclosure

The project will not pursue action against researchers who follow this policy and act in good faith.