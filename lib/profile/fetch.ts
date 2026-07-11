import type { SupabaseClient } from "@supabase/supabase-js";

// Member data read through the user's own session (RLS: auth.uid() = user_id),
// mirroring what the iOS app stores — profiles, saved stance setups
// (snowboard + ski) and gear setups (snowboard + ski, with catalog joins).

export interface MemberProfile {
  id: string;
  name: string | null;
  display_name: string | null;
  username: string | null;
  gender: string | null;
  birth_date: string | null;
  height: number | null;
  weight: number | null;
  footsize_US: number | null;
  leglength: number | null;
  goofy: boolean | null;
  profile_picture_url: string | null;
}

export interface SnowboardSetupRow {
  id: string;
  name: string | null;
  width: number;
  front_angle: string;
  rear_angle: string;
  method: string | null;
  riding_style: string | null;
  board_length: number;
  highback_lean: string | null;
  skill_level: string | null;
  goofy: boolean | null;
  is_base_setup: boolean | null;
  carving_stance_type: string | null;
  height: number | null;
  created_at: string;
}

export interface SkiSetupRow {
  id: string;
  name: string | null;
  ski_length_cm: number;
  mount_offset_mm: number;
  din_reference_min: number | null;
  din_reference_max: number | null;
  terrain_focus: string | null;
  skill_level: string | null;
  is_base_setup: boolean | null;
  created_at: string;
}

export interface GearItem {
  kind: string;
  label: string | null;
  imageUrl: string | null;
}

export interface GearSetupCardData {
  id: string;
  title: string | null;
  isBase: boolean;
  items: GearItem[];
}

export interface MemberData {
  profile: MemberProfile | null;
  snowboardSetups: SnowboardSetupRow[];
  skiSetups: SkiSetupRow[];
  snowboardGear: GearSetupCardData[];
  skiGear: GearSetupCardData[];
}

async function catalogImages(
  supabase: SupabaseClient,
  table: "boards" | "boots" | "bindings",
  ids: string[]
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  const wanted = ids.filter(Boolean);
  if (wanted.length === 0) return map;
  const { data } = await supabase.from(table).select("id, image_url").in("id", wanted);
  for (const row of data ?? []) map.set(row.id as string, (row.image_url as string) ?? null);
  return map;
}

export async function fetchMemberData(
  supabase: SupabaseClient,
  userId: string
): Promise<MemberData> {
  const [profileRes, sbRes, skiRes, gearRes, gearSkiRes] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, name, display_name, username, gender, birth_date, height, weight, footsize_US, leglength, goofy, profile_picture_url"
      )
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("stance_setups")
      .select(
        "id, name, width, front_angle, rear_angle, method, riding_style, board_length, highback_lean, skill_level, goofy, is_base_setup, carving_stance_type, height, created_at"
      )
      .eq("user_id", userId)
      .order("is_base_setup", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("stance_setups_ski")
      .select(
        "id, name, ski_length_cm, mount_offset_mm, din_reference_min, din_reference_max, terrain_focus, skill_level, is_base_setup, created_at"
      )
      .eq("user_id", userId)
      .order("is_base_setup", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("gear_setups")
      .select(
        "id, title, snowboard_type, boots_type, bindings_type, snowboard_id, boots_id, bindings_id, is_base_gear_setup, created_at"
      )
      .eq("user_id", userId)
      .order("is_base_gear_setup", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("gear_setups_ski")
      .select(
        "id, title, ski_type, ski_boots_type, ski_bindings_type, is_base_gear_setup, created_at"
      )
      .eq("user_id", userId)
      .order("is_base_gear_setup", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  const gearRows = gearRes.data ?? [];
  const [boardImgs, bootImgs, bindingImgs] = await Promise.all([
    catalogImages(supabase, "boards", gearRows.map((g) => g.snowboard_id as string)),
    catalogImages(supabase, "boots", gearRows.map((g) => g.boots_id as string)),
    catalogImages(supabase, "bindings", gearRows.map((g) => g.bindings_id as string)),
  ]);

  const snowboardGear: GearSetupCardData[] = gearRows.map((g) => ({
    id: g.id as string,
    title: (g.title as string) ?? null,
    isBase: Boolean(g.is_base_gear_setup),
    items: [
      {
        kind: "Board",
        label: (g.snowboard_type as string) ?? null,
        imageUrl: boardImgs.get(g.snowboard_id as string) ?? null,
      },
      {
        kind: "Boots",
        label: (g.boots_type as string) ?? null,
        imageUrl: bootImgs.get(g.boots_id as string) ?? null,
      },
      {
        kind: "Bindings",
        label: (g.bindings_type as string) ?? null,
        imageUrl: bindingImgs.get(g.bindings_id as string) ?? null,
      },
    ],
  }));

  // Ski catalog rows carry image_filename without a public URL contract, so
  // ski gear renders label-only.
  const skiGear: GearSetupCardData[] = (gearSkiRes.data ?? []).map((g) => ({
    id: g.id as string,
    title: (g.title as string) ?? null,
    isBase: Boolean(g.is_base_gear_setup),
    items: [
      { kind: "Skis", label: (g.ski_type as string) ?? null, imageUrl: null },
      { kind: "Boots", label: (g.ski_boots_type as string) ?? null, imageUrl: null },
      { kind: "Bindings", label: (g.ski_bindings_type as string) ?? null, imageUrl: null },
    ],
  }));

  return {
    profile: (profileRes.data as MemberProfile | null) ?? null,
    snowboardSetups: (sbRes.data as SnowboardSetupRow[] | null) ?? [],
    skiSetups: (skiRes.data as SkiSetupRow[] | null) ?? [],
    snowboardGear,
    skiGear,
  };
}
