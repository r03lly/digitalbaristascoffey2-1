import { supabase } from "@/integrations/supabase/client";
import { FOOD_MENU, SCOFFEY_MENU, type MenuItem } from "./barista-data";

export type MenuRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: number;
  category: string;
  subcategory: string;
  emoji: string;
  image_id: string;
  sort_order: number;
  active: boolean;
};

export const DRINK_SUBCATEGORIES = [
  { id: "kopi", label: "Kopi" },
  { id: "non-kopi", label: "Non-Kopi" },
  { id: "matcha", label: "Matcha" },
  { id: "cokelat", label: "Cokelat" },
] as const;

export function drinkSubcategoryLabel(id: string): string {
  return DRINK_SUBCATEGORIES.find((s) => s.id === id)?.label ?? id;
}

export type MenuDisplayRow = MenuRow & { image_url?: string };

export type MenuInput = {
  slug: string;
  name: string;
  description: string;
  price: number;
  category: string;
  subcategory?: string;
  emoji?: string;
  image_id?: string;
  sort_order?: number;
  active?: boolean;
};

export function rowToItem(row: MenuDisplayRow): MenuItem {
  return {
    id: row.slug,
    name: row.name,
    desc: row.description,
    price: Number(row.price),
    emoji: row.emoji,
    imageId: row.image_url ?? row.image_id,
  };
}

const MENU_IMAGE_PREFIX = "storage:";

async function resolveMenuImages(rows: MenuRow[]): Promise<MenuDisplayRow[]> {
  const paths = rows
    .map((row) => row.image_id)
    .filter((imageId) => imageId.startsWith(MENU_IMAGE_PREFIX))
    .map((imageId) => imageId.slice(MENU_IMAGE_PREFIX.length));
  if (!paths.length) return rows;

  const { data, error } = await supabase.storage.from("menu-images").createSignedUrls(paths, 3600);
  if (error) return rows;
  const urls = new Map(
    (data ?? [])
      .filter((item) => item.signedUrl)
      .map((item) => [item.path, item.signedUrl] as const),
  );
  return rows.map((row) => {
    if (!row.image_id.startsWith(MENU_IMAGE_PREFIX)) return row;
    const path = row.image_id.slice(MENU_IMAGE_PREFIX.length);
    const imageUrl = urls.get(path);
    return imageUrl ? { ...row, image_url: imageUrl } : row;
  });
}

/** Menu bawaan sebagai cadangan jika database belum bisa dibaca. */
export const FALLBACK_DRINKS = SCOFFEY_MENU;
export const FALLBACK_FOOD = FOOD_MENU;

export async function fetchMenuItems(includeInactive = false): Promise<MenuDisplayRow[]> {
  let q = supabase
    .from("menu_items")
    .select("*")
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true });
  if (!includeInactive) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw error;
  return resolveMenuImages((data ?? []) as MenuRow[]);
}

export async function uploadMenuImage(file: File, slug: string): Promise<string> {
  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${slug}-${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("menu-images").upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
  return `${MENU_IMAGE_PREFIX}${path}`;
}

export async function deleteMenuImage(imageId: string): Promise<void> {
  if (!imageId.startsWith(MENU_IMAGE_PREFIX)) return;
  const { error } = await supabase.storage
    .from("menu-images")
    .remove([imageId.slice(MENU_IMAGE_PREFIX.length)]);
  if (error) throw error;
}

export async function adminCreateMenuItem(input: MenuInput): Promise<MenuRow> {
  const { data, error } = await supabase
    .from("menu_items")
    .insert({
      slug: input.slug,
      name: input.name,
      description: input.description,
      price: input.price,
      category: input.category,
      subcategory: input.subcategory ?? "",
      emoji: input.emoji ?? "",
      image_id: input.image_id ?? "",
      sort_order: input.sort_order ?? 99,
      active: input.active ?? true,
    })
    .select()
    .single();
  if (error) throw error;
  return data as MenuRow;
}

export async function adminUpdateMenuItem(
  id: string,
  patch: Partial<Omit<MenuRow, "id">>,
): Promise<void> {
  const { error } = await supabase.from("menu_items").update(patch).eq("id", id);
  if (error) throw error;
}

export async function adminDeleteMenuItem(id: string): Promise<void> {
  const { error } = await supabase.from("menu_items").delete().eq("id", id);
  if (error) throw error;
}
