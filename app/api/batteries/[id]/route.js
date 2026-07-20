import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabase-admin';
import { requireSession } from '../../../../lib/session-auth';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request, { params }) {
  const authError = await requireSession(request);
  if (authError) return authError;

  const { id } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { name, battery_class_id } = body;

  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  let normalizedClassId = null;
  if (battery_class_id !== null && battery_class_id !== undefined && battery_class_id !== '') {
    if (typeof battery_class_id !== 'string' || !UUID_PATTERN.test(battery_class_id)) {
      return NextResponse.json({ error: 'Invalid battery_class_id' }, { status: 400 });
    }
    normalizedClassId = battery_class_id;
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();

    const { data: updatedBattery, error } = await supabaseAdmin
      .from('batteries')
      .update({
        name: name.trim(),
        battery_class_id: normalizedClassId,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select(`
        *,
        battery_classes (
          short_name,
          capacity_kwh,
          cpower_w,
          ppower_w
        )
      `)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Battery not found' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, battery: updatedBattery });
  } catch (error) {
    console.error('Battery update error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update battery' },
      { status: 500 }
    );
  }
}
