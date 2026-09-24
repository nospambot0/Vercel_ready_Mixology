import { Router, type IRouter } from "express";
import healthRouter from "./health";
import manageAuthRouter from "./manage-auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(manageAuthRouter);

export default router;
