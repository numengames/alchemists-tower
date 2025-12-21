import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id || !session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const secret = authenticator.generateSecret();

    const otpauth = authenticator.keyuri(session.user.email, 'Khepri Forge', secret);

    const qrCode = await QRCode.toDataURL(otpauth);

    return NextResponse.json({ secret, qrCode });
  } catch (error) {
    console.error('Generate 2FA secret error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
