# Privacy Policy — The Edge

**Last updated:** March 2026

## 1. Introduction

The Edge ("we", "our", "the app") is an AI-powered influence training application. This privacy policy explains how we collect, use, and protect your personal data in compliance with the UK General Data Protection Regulation (UK GDPR) and the Data Protection Act 2018.

## 2. Data Controller

The Edge is operated by [Your Company Name], registered at [Your Registered Address]. For data protection enquiries, contact: privacy@theedge.app

## 3. Data We Collect

### 3.1 Account Data
- Email address
- Display name
- Password (hashed, never stored in plaintext)
- Apple ID token (if using Apple Sign-In)

### 3.2 Profile Data (provided during onboarding)
- Professional context (role, company, goals)
- Experience level
- Training goals

### 3.3 Session Data
- Roleplay transcripts (conversations with AI characters)
- Performance scores (1-5 across 5 dimensions)
- Behavioural analysis summaries
- Mission assignments and outcomes
- Session timestamps and completion status

### 3.4 Technical Data
- Device type and OS version
- App version
- Crash logs (anonymised)

### 3.5 Subscription Data
- Subscription tier (free/pro)
- App Store transaction IDs
- Subscription expiry dates

## 4. How We Use Your Data

| Purpose | Legal Basis |
|---------|-------------|
| Provide the training service | Contract performance |
| Personalise AI scenarios and feedback | Legitimate interest |
| Track skill progression over time | Contract performance |
| Process subscription payments | Contract performance |
| Improve the service | Legitimate interest |
| Send training reminders (with consent) | Consent |
| Crash reporting and bug fixes | Legitimate interest |

## 5. AI Processing

Your session data (including roleplay transcripts and performance history) is processed by Anthropic's Claude AI models to generate personalised lessons, roleplay scenarios, performance analysis, and missions. This data is sent to Anthropic's API for processing. Anthropic's data handling practices are described at https://www.anthropic.com/privacy.

**Important:** Anthropic does not use your data to train their AI models when accessed via their API.

## 6. Data Storage

- Account and session data is stored in Supabase (PostgreSQL) with row-level security ensuring per-user data isolation
- Data is encrypted at rest and in transit (TLS 1.3)
- Servers are located in the EU/UK region
- Authentication tokens are stored in the iOS Keychain

## 7. Data Retention

- Active accounts: data retained for the duration of the account
- Deleted accounts: all personal data deleted within 30 days
- Anonymised analytics: retained indefinitely for service improvement

## 8. Your Rights

Under UK GDPR, you have the right to:

- **Access** your personal data (request a data export)
- **Rectify** inaccurate data
- **Erase** your data ("right to be forgotten")
- **Restrict** processing
- **Data portability** (receive your data in a structured format)
- **Object** to processing based on legitimate interest
- **Withdraw consent** for optional processing (e.g., notifications)

To exercise these rights, contact privacy@theedge.app. We will respond within 30 days.

## 9. Data Sharing

We do not sell your personal data. We share data only with:

| Recipient | Purpose | Data Shared |
|-----------|---------|-------------|
| Anthropic | AI processing | Session transcripts, user context |
| Supabase | Database hosting | All account and session data |
| Apple | Payment processing | Transaction data via StoreKit |

## 10. Children

The Edge is not intended for users under 16. We do not knowingly collect data from children.

## 11. Changes to This Policy

We will notify users of material changes via in-app notification and update the "Last updated" date above.

## 12. Contact

For privacy enquiries: privacy@theedge.app
For complaints: You may contact the Information Commissioner's Office (ICO) at https://ico.org.uk
