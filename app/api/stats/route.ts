import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = 'https://ryiitcblrrqvjvxkobpf.supabase.co';

// These are whole-table counts across every user, so they need the service key
// (same env var app/clip/[token] uses). `profiles` and `stance_setups` are no
// longer readable by anon at all, and `stance_setups_ski` never was — with the
// publishable key all three count 0, which is why the landing page has been
// undercounting setups. supabase-js reports that as { count: null, error },
// not a rejection, so the counts are checked explicitly below rather than
// leaning on the catch block.
const supabaseKey =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  '';

const FALLBACK = {
  users: '1K+',
  setups: '5K+',
  proRiders: 100,
  rating: '4.8', // App Store rating
};

export async function GET() {
  if (!supabaseKey) {
    console.error('stats: no service key configured, serving fallback');
    return NextResponse.json(FALLBACK);
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get counts in parallel
    const [users, snowboard, ski, proRiders] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('stance_setups').select('*', { count: 'exact', head: true }),
      supabase.from('stance_setups_ski').select('*', { count: 'exact', head: true }),
      supabase.from('pro_riders').select('*', { count: 'exact', head: true }),
    ]);

    const failed = [users, snowboard, ski, proRiders].find((r) => r.error);
    if (failed) {
      console.error('Error fetching stats:', failed.error);
      return NextResponse.json(FALLBACK);
    }

    const totalSetups = (snowboard.count || 0) + (ski.count || 0);

    return NextResponse.json({
      users: formatNumber(users.count || 0),
      setups: formatNumber(totalSetups),
      proRiders: proRiders.count || 0,
      rating: FALLBACK.rating,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json(FALLBACK);
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







