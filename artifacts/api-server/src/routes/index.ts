import { Router, type IRouter } from "express";
import healthRouter from "./health";
import analyzeRouter from "./analyze/index";
import paymentRouter from "./payment";
import chatRouter from "./chat";
import paystackRouter from "./paystack";
import loanOffersRouter from "./loan-offers";
import emailRouter from "./email";
import marketplaceRouter from "./marketplace";
import hpRouter from "./hp";

const router: IRouter = Router();

router.use(healthRouter);
router.use(analyzeRouter);
router.use(paymentRouter);
router.use(chatRouter);
router.use(paystackRouter);
router.use(loanOffersRouter);
router.use(emailRouter);
router.use(marketplaceRouter);
router.use(hpRouter);

export default router;
