import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  UpdateProfileSchema,
  UpdateUserSettingsSchema,
} from "../schemas/index.js";
import {
  getMyProfile,
  updateMyProfile,
  getUserById,
  heartbeat,
  getMySettings,
  updateUserSettings,
} from "../controllers/user.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/me", getMyProfile);
router.post("/me/heartbeat", heartbeat);
router.patch("/me", validate(UpdateProfileSchema), updateMyProfile);

router.get("/me/settings", getMySettings);
router.patch(
  "/me/settings",
  validate(UpdateUserSettingsSchema),
  updateUserSettings,
);

router.get("/:id", getUserById);

export default router;
