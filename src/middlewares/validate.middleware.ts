import { Request, Response, NextFunction } from "express";
import { ZodError, ZodType } from "zod";
import { ApiError } from "./error.middleware.js";

type RequestTarget = "body" | "params" | "query";

/**
 * Validate a specific part of the Request object using a Zod schema.
 *
 * - Runs the schema asynchronously (supports .superRefine with async logic).
 * - On success: replaces req[target] with the parsed, transformed, and clean data.
 * - On failure: forwards a 400 ApiError with per-field error messages.
 *
 * Usage:
 *   router.post("/register", validate(RegisterSchema),           controller); // body (default)
 *   router.get("/:id",       validate(IdParamSchema, "params"), controller);
 *   router.get("/search",    validate(SearchSchema, "query"),    controller);
 */
export const validate =
  (schema: ZodType, target: RequestTarget = "body") =>
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const result = await schema.safeParseAsync(req[target]);

    if (!result.success) {
      const fieldErrors = (result.error as ZodError).flatten().fieldErrors;
      return next(ApiError.badRequest("Validation failed", fieldErrors));
    }

    // Overwrite with the parsed + transformed data
    (req as unknown as Record<string, unknown>)[target] = result.data;
    next();
  };
