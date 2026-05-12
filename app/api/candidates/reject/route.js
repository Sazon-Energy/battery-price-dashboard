import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabase-admin';
import { requireAdminToken } from '../../../../lib/admin-auth';

export async function POST(request) {
  const authError = requireAdminToken(request);
  if (authError) return authError;

  try {
    const { candidateId, reason } = await request.json();
    if (!candidateId) {
      return NextResponse.json({ error: 'candidateId required' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { error } = await supabaseAdmin
      .from('battery_candidates')
      .update({
        status: 'rejected',
        rejection_reason: reason || null,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', candidateId)
      .eq('status', 'pending');

    if (error) {
      return NextResponse.json(
        { error: `Failed to reject candidate: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Reject error:', error);
    return NextResponse.json(
      { error: error.message || 'Rejection failed' },
      { status: 500 }
    );
  }
}
