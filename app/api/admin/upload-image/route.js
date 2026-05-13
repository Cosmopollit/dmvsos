import { createClient } from '@supabase/supabase-js';
import { checkAdminPassword } from '@/lib/adminAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

// Verify magic bytes — `file.type` is client-supplied and cannot be trusted.
// SVG is rejected because public bucket URLs become <img src=...> which renders
// inline <script> in SVGs.
function detectImageType(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return 'image/png';
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return 'image/webp';
  return null;
}

export async function POST(req) {
  try {
    const formData = await req.formData();
    const password = formData.get('password');
    const questionId = formData.get('questionId');
    const storagePath = formData.get('path');
    const action = formData.get('action');

    if (!checkAdminPassword(password)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // DELETE image
    if (action === 'delete') {
      if (!questionId) return Response.json({ error: 'Missing questionId' }, { status: 400 });

      if (storagePath) {
        await supabase.storage.from('question-images').remove([storagePath]);
      }

      // Fetch cluster info before clearing
      const { data: q } = await supabase
        .from('questions')
        .select('cluster_code, state, category')
        .eq('id', questionId)
        .single();

      const { error: dbError } = await supabase
        .from('questions')
        .update({ image_url: null })
        .eq('id', questionId);
      if (dbError) throw new Error(dbError.message);

      // Propagate null to all language rows in the same cluster
      if (q?.cluster_code && q?.state && q?.category) {
        await supabase
          .from('questions')
          .update({ image_url: null })
          .eq('cluster_code', q.cluster_code)
          .eq('state', q.state)
          .eq('category', q.category)
          .neq('id', questionId);
      }

      return Response.json({ ok: true });
    }

    // UPLOAD image
    const file = formData.get('file');
    if (!file || !questionId || !storagePath) {
      return Response.json({ error: 'Missing file, questionId, or path' }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return Response.json({ error: 'File too large (max 5MB)' }, { status: 400 });
    }
    if (!ALLOWED_MIME.has(file.type)) {
      return Response.json({ error: 'Unsupported file type' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const detectedType = detectImageType(buffer);
    if (!detectedType || detectedType !== file.type) {
      return Response.json({ error: 'File content does not match declared type' }, { status: 400 });
    }

    const { error: uploadError } = await supabase.storage
      .from('question-images')
      .upload(storagePath, buffer, {
        contentType: detectedType,
        upsert: true,
      });
    if (uploadError) throw new Error(uploadError.message);

    const { data: { publicUrl } } = supabase.storage
      .from('question-images')
      .getPublicUrl(storagePath);

    // Fetch cluster info before updating
    const { data: q } = await supabase
      .from('questions')
      .select('cluster_code, state, category')
      .eq('id', questionId)
      .single();

    const { error: dbError } = await supabase
      .from('questions')
      .update({ image_url: publicUrl })
      .eq('id', questionId);
    if (dbError) throw new Error(dbError.message);

    // Propagate image_url to all language rows in the same cluster
    if (q?.cluster_code && q?.state && q?.category) {
      await supabase
        .from('questions')
        .update({ image_url: publicUrl })
        .eq('cluster_code', q.cluster_code)
        .eq('state', q.state)
        .eq('category', q.category)
        .neq('id', questionId);
    }

    return Response.json({ ok: true, url: publicUrl });
  } catch (err) {
    console.error('Image upload error:', err.message);
    return Response.json({ error: err.message || 'Upload failed' }, { status: 500 });
  }
}
