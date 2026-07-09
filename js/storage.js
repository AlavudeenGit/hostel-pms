import { supabase, isConfigured } from "./supabaseClient.js";

const BUCKET = "hostel-documents";

/**
 * Uploads a File to Supabase Storage and returns its public URL.
 * In demo mode (no Supabase project connected yet) it returns a
 * temporary local object URL so previews still work in this session.
 */
export async function uploadFile(file, folder = "misc") {
  if (!file) return "";

  if (!isConfigured) {
    return URL.createObjectURL(file);
  }

  const path = `${folder}/${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
