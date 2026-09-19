import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { UpdateProfileSchema } from "../schemas/auth.schema.js";
import {
  getMyProfile,
  updateMyProfile,
  getUserById,
} from "../controllers/user.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/me", getMyProfile);
router.patch("/me", validate(UpdateProfileSchema), updateMyProfile);
router.get("/:id", getUserById);

export default router;
