import crypto from "node:crypto";
import { CLERK_SECRET_KEY, MESSAGE_ENCRYPTION_KEY } from "../config/env.config.js";

/**
 * 32-byte secret key derived from environment configuration.
 * In production, provide a dedicated 32-byte (64 hex characters) MESSAGE_ENCRYPTION_KEY.
 */
const DERIVED_SERVER_KEY: Buffer = crypto
  .createHash("sha256")
  .update(MESSAGE_ENCRYPTION_KEY || CLERK_SECRET_KEY || "talkapp-fallback-secret-key-32b")
  .digest();

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  tag: string;
  algorithm: string;
}

/**
 * Encrypt a plaintext string using AES-256-GCM (Authenticated Encryption).
 * Generates a unique 12-byte initialization vector (IV) per encryption.
 */
export function encryptMessage(plaintext: string): EncryptedPayload {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", DERIVED_SERVER_KEY, iv);

  let ciphertext = cipher.update(plaintext, "utf8", "hex");
  ciphertext += cipher.final("hex");

  const tag = cipher.getAuthTag().toString("hex");

  return {
    ciphertext,
    iv: iv.toString("hex"),
    tag,
    algorithm: "AES-256-GCM",
  };
}

/**
 * Decrypt an AES-256-GCM ciphertext payload with authenticity check.
 * Throws an error if the data or tag has been tampered with.
 */
export function decryptMessage(encrypted: EncryptedPayload): string {
  const iv = Buffer.from(encrypted.iv, "hex");
  const tag = Buffer.from(encrypted.tag, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", DERIVED_SERVER_KEY, iv);

  decipher.setAuthTag(tag);

  let plaintext = decipher.update(encrypted.ciphertext, "hex", "utf8");
  plaintext += decipher.final("utf8");

  return plaintext;
}

/**
 * Standard Envelope format for Client-Side End-to-End Encryption (E2EE).
 *
 * In E2EE (e.g., Signal Protocol or WebCrypto ECDH + AES-GCM):
 * 1. Client generates ephemeral ECDH keypair and derives shared secret with recipient.
 * 2. Client encrypts plaintext on device -> sends E2EEMessageEnvelope.
 * 3. Server stores and forwards the envelope blindly without holding decryption keys.
 */
export interface E2EEMessageEnvelope {
  ciphertext: string;
  nonce: string;
  ephemeralPublicKey?: string;
  senderDeviceId?: string;
  recipientKeyFingerprint?: string;
}
