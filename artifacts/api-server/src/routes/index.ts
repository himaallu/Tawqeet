import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import agencyRouter from "./agency";
import clientsRouter from "./clients";
import systemRouter from "./system";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(agencyRouter);
router.use(clientsRouter);
router.use(systemRouter);

export default router;
