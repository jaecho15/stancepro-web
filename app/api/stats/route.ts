import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = 'https://ryiitcblrrqvjvxkobpf.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export async function GET() {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get counts in parallel
    const [
      { count: userCount },
      { count: snowboardSetups },
      { count: skiSetups },
      { count: proRiderCount },
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('stance_setups').select('*', { count: 'exact', head: true }),
      supabase.from('stance_setups_ski').select('*', { count: 'exact', head: true }),
      supabase.from('pro_riders').select('*', { count: 'exact', head: true }),
    ]);

    const totalSetups = (snowboardSetups || 0) + (skiSetups || 0);

    return NextResponse.json({
      users: formatNumber(userCount || 0),
      setups: formatNumber(totalSetups),
      proRiders: proRiderCount || 0,
      rating: '4.8', // App Store rating
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json({
      users: '1K+',
      setups: '5K+',
      proRiders: 100,
      rating: '4.8',
    });
  }
}

function formatNumber(num: number): string {
  if (num >= 10000) {
    return Math.floor(num / 1000) + 'K+';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K+';
  }
  return num.toString() + '+';
}

