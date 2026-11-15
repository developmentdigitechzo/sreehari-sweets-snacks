# Field validation rules

One rule per field, written three times (phone app `mobile/AGENTS/src/utils/validation.ts`, backend `backend/env-backend/src/modules/auth/validators.ts`,
admin `admin/package/lib/validate.ts`) and checked by the same test cases in each (`validation.test.ts`, `validators.test.ts`, `validate.test.ts`).

| Field | Rule |
|---|---|
| Indian mobile | Ten digits, first digit 6-9. Accepted written as `9876543210`, `09876543210`, `91 98765 43210`, `+91-98765-43210`, `0091…`; always stored as `+91XXXXXXXXXX`. A ten-digit number that starts with 91 (for example 9123456789) is a normal number. With a leading `+`, the country code must be 91 and ten digits must follow. |
| Phone field in the app | Digits only, at most ten; a pasted `+91` / `0` prefix is dropped while typing. |
| Email | One `@`, no spaces; local part up to 64 characters with no leading, trailing or doubled dots; every domain label 1-63 characters, letters/digits/hyphens, not starting or ending with a hyphen; a letters-only TLD of 2-63 characters (or `xn--…`); 254 characters in total. Trimmed; the server stores it lower-case. |
| Name | 2-80 characters with at least one letter in any script (Tamil works). "12" and "!!" are refused. |
| Pincode | Six digits, never starting with 0. |
| Password | 8-128 characters with a letter and a number (staff: 10+). |
| Staff phone (admin) | An Indian mobile in any form, or a full international number `+<country><number>`. |
| Shop contact phone (admin) | Optional; a mobile or landline of 7-15 digits (digits, spaces, dashes, brackets, leading +). |
| OTP code | Exactly six digits. |
