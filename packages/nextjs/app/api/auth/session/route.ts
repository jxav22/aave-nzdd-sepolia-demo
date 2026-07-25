import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { isPrivyEnabled } from "~~/utils/auth/isPrivyEnabled";
import { extractUserProfile, getPrivyUser, verifyPrivyAccessToken } from "~~/utils/auth/privyServer";
import { type AuthSessionData, defaultSession, getSessionOptions } from "~~/utils/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getSession() {
  return getIronSession<AuthSessionData>(await cookies(), getSessionOptions());
}

export async function GET() {
  const session = await getSession();

  if (!session.isLoggedIn) {
    return NextResponse.json(defaultSession);
  }

  return NextResponse.json({
    isLoggedIn: true,
    privyUserId: session.privyUserId,
    address: session.address,
    email: session.email,
    signedInAt: session.signedInAt,
  } satisfies AuthSessionData);
}

export async function POST(request: Request) {
  if (!isPrivyEnabled || !process.env.PRIVY_APP_SECRET) {
    return NextResponse.json({ error: "Privy auth not configured" }, { status: 503 });
  }

  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!accessToken) {
    return NextResponse.json({ error: "Missing Authorization Bearer token" }, { status: 401 });
  }

  try {
    const claims = await verifyPrivyAccessToken(accessToken);
    const user = await getPrivyUser(claims.user_id);
    const profile = extractUserProfile(user);

    const session = await getSession();
    session.isLoggedIn = true;
    session.privyUserId = claims.user_id;
    session.address = profile.address;
    session.email = profile.email;
    session.signedInAt = new Date().toISOString();
    await session.save();

    return NextResponse.json({
      isLoggedIn: true,
      privyUserId: session.privyUserId,
      address: session.address,
      email: session.email,
      signedInAt: session.signedInAt,
    } satisfies AuthSessionData);
  } catch {
    console.error("Privy session exchange failed");
    return NextResponse.json({ error: "Invalid or expired Privy access token" }, { status: 401 });
  }
}

export async function DELETE() {
  const session = await getSession();
  session.destroy();
  return NextResponse.json(defaultSession);
}
