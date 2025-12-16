import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = 'https://ryiitcblrrqvjvxkobpf.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '6');

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
      .from('pro_riders')
      .select('id, name, stance_width, binding_angle_front, binding_angle_rear, image_url, sponsor, styles')
      .limit(limit);

    if (error) throw error;

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Error fetching pro riders:', error);
    return NextResponse.json([]);
  }
}

