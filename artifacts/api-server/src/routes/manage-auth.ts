import { timingSafeEqual } from "node:crypto";
import { Router, type IRouter } from "express";

const router: IRouter = Router();
const SESSION_COOKIE = "hillview_manage_session";
const SESSION_MAX_AGE = 8 * 60 * 60 * 1000;
const MANAGE_PASSWORD = "adminhillview";

function matchesPassword(candidate: unknown, expected: string | undefined) {
  if (typeof candidate !== "string" || !expected) return false;
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  return candidateBuffer.length === expectedBuffer.length
    && timingSafeEqual(candidateBuffer, expectedBuffer);
}

router.get("/manage/session", (req, res) => {
  res.json({ authenticated: req.signedCookies?.[SESSION_COOKIE] === "authenticated" });
});

router.post("/manage/login", (req, res) => {
  if (!matchesPassword(req.body?.password, MANAGE_PASSWORD)) {
    res.status(401).json({ message: "Invalid password" });
    return;
  }

  res.cookie(SESSION_COOKIE, "authenticated", {
    httpOnly: true,
    signed: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
  res.json({ authenticated: true });
});

router.post("/manage/logout", (req, res) => {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  res.json({ authenticated: false });
});

export default router;