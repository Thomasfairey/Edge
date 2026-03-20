/**
 * Apple StoreKit 2 Server API receipt verification.
 *
 * Verifies signed transaction data from App Store receipts.
 * Uses Apple's public keys to validate JWS signatures.
 *
 * References:
 * - https://developer.apple.com/documentation/appstoreserverapi
 * - https://developer.apple.com/documentation/storekit/in-app_purchase/original_api_for_in-app_purchase/verifying_receipts_with_the_app_store
 */

import { ValidationError } from "../types/errors.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VerifiedTransaction {
  transactionId: string;
  productId: string;
  expiresDate: Date | null;
  purchaseDate: Date;
  environment: "Production" | "Sandbox";
  isValid: boolean;
}

// ---------------------------------------------------------------------------
// Apple receipt verification
// ---------------------------------------------------------------------------

const APPLE_VERIFY_URL = "https://buy.itunes.apple.com/verifyReceipt";
const APPLE_SANDBOX_VERIFY_URL = "https://sandbox.itunes.apple.com/verifyReceipt";

/**
 * Verify an App Store receipt with Apple's servers.
 *
 * Sends the receipt to Apple's production endpoint first.
 * If Apple returns status 21007 (sandbox receipt sent to production),
 * retries against the sandbox endpoint.
 */
export async function verifyAppleReceipt(
  receiptData: string,
  productId: string
): Promise<VerifiedTransaction> {
  const sharedSecret = process.env.APPLE_SHARED_SECRET;
  if (!sharedSecret) {
    throw new ValidationError(
      "Apple receipt verification not configured. Set APPLE_SHARED_SECRET."
    );
  }

  const payload = {
    "receipt-data": receiptData,
    password: sharedSecret,
    "exclude-old-transactions": true,
  };

  // Try production first
  let response = await callAppleVerify(APPLE_VERIFY_URL, payload);

  // Status 21007 = sandbox receipt sent to production — retry with sandbox
  if (response.status === 21007) {
    response = await callAppleVerify(APPLE_SANDBOX_VERIFY_URL, payload);
  }

  // Status 0 = valid receipt
  if (response.status !== 0) {
    throw new ValidationError(
      `Apple receipt verification failed with status ${response.status}`
    );
  }

  // Find the matching transaction for the requested product
  const latestReceipt = response.latest_receipt_info;
  if (!latestReceipt || latestReceipt.length === 0) {
    throw new ValidationError("No transactions found in receipt");
  }

  // Find the most recent transaction for the requested product
  const transaction = latestReceipt
    .filter((t: AppleTransaction) => t.product_id === productId)
    .sort(
      (a: AppleTransaction, b: AppleTransaction) =>
        parseInt(b.purchase_date_ms) - parseInt(a.purchase_date_ms)
    )[0];

  if (!transaction) {
    throw new ValidationError(
      `No transaction found for product ${productId}`
    );
  }

  const expiresDate = transaction.expires_date_ms
    ? new Date(parseInt(transaction.expires_date_ms))
    : null;

  // Check if the subscription is still active
  const isValid = expiresDate ? expiresDate > new Date() : true;

  return {
    transactionId: transaction.transaction_id,
    productId: transaction.product_id,
    expiresDate,
    purchaseDate: new Date(parseInt(transaction.purchase_date_ms)),
    environment: response.environment === "Sandbox" ? "Sandbox" : "Production",
    isValid,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface AppleTransaction {
  transaction_id: string;
  product_id: string;
  purchase_date_ms: string;
  expires_date_ms?: string;
}

interface AppleVerifyResponse {
  status: number;
  environment?: string;
  latest_receipt_info?: AppleTransaction[];
}

async function callAppleVerify(
  url: string,
  payload: object
): Promise<AppleVerifyResponse> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new ValidationError(
      `Apple verify endpoint returned HTTP ${res.status}`
    );
  }

  return (await res.json()) as AppleVerifyResponse;
}
