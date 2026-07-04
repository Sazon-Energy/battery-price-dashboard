import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabase-admin';
import { requireAdminToken } from '../../../../lib/admin-auth';

export async function POST(request) {
  const authError = requireAdminToken(request);
  if (authError) return authError;

  try {
    const { candidateId } = await request.json();
    if (!candidateId) {
      return NextResponse.json({ error: 'candidateId required' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Load candidate (must be pending)
    const { data: candidate, error: loadError } = await supabaseAdmin
      .from('battery_candidates')
      .select('*, manufacturers(name)')
      .eq('id', candidateId)
      .eq('status', 'pending')
      .single();

    if (loadError || !candidate) {
      return NextResponse.json(
        { error: 'Candidate not found or not pending' },
        { status: 404 }
      );
    }

    // Insert into batteries. battery_class_id stays NULL; backfilled later.
    const { data: battery, error: insertError } = await supabaseAdmin
      .from('batteries')
      .insert({
        name: candidate.name,
        target_url: candidate.normalized_url,
        supplier: candidate.manufacturers?.name || null,
        manufacturer_id: candidate.manufacturer_id,
        current_price: candidate.discovered_price
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: `Failed to insert battery: ${insertError.message}` },
        { status: 500 }
      );
    }

    // Seed price_history with the discovered price
    if (candidate.discovered_price) {
      const { error: historyError } = await supabaseAdmin
        .from('price_history')
        .insert({
          battery_id: battery.id,
          price: candidate.discovered_price,
          scraped_at: candidate.discovered_at
        });

      if (historyError) {
        console.warn('Failed to seed price_history:', historyError.message);
      }
    }

    // Mark candidate approved and link it to the battery it became.
    const { error: updateError } = await supabaseAdmin
      .from('battery_candidates')
      .update({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        battery_id: battery.id
      })
      .eq('id', candidateId);

    if (updateError) {
      console.warn('Failed to mark candidate approved:', updateError.message);
    }

    return NextResponse.json({ success: true, battery });
  } catch (error) {
    console.error('Approve error:', error);
    return NextResponse.json(
      { error: error.message || 'Approval failed' },
      { status: 500 }
    );
  }
}
