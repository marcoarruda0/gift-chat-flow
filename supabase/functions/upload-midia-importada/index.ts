import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: corsHeaders });
    }
    const userId = claimsData.claims.sub;

    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: profile } = await adminClient
      .from("profiles").select("tenant_id").eq("id", userId).single();
    if (!profile?.tenant_id) {
      return new Response(JSON.stringify({ error: "Tenant não encontrado" }), { status: 400, headers: corsHeaders });
    }
    const tenantId = profile.tenant_id;

    // Parse FormData
    const formData = await req.formData();
    const conversaId = formData.get("conversa_id") as string;
    const file = formData.get("file") as File;
    const mediaFilename = formData.get("media_filename") as string;

    if (!conversaId || !file || !mediaFilename) {
      return new Response(JSON.stringify({ error: "conversa_id, file e media_filename são obrigatórios" }), { status: 400, headers: corsHeaders });
    }

    // Verify conversa belongs to tenant
    const { data: conversa } = await adminClient
      .from("conversas").select("id").eq("id", conversaId).eq("tenant_id", tenantId).single();
    if (!conversa) {
      return new Response(JSON.stringify({ error: "Conversa não encontrada" }), { status: 404, headers: corsHeaders });
    }

    // Upload to storage
    const storagePath = `${tenantId}/importados/${conversaId}/${mediaFilename}`;
    const fileBuffer = await file.arrayBuffer();

    const { error: uploadErr } = await adminClient.storage
      .from("chat-media")
      .upload(storagePath, fileBuffer, {
        contentType: file.type || "application/octet-stream",
        upsert: true,
      });

    if (uploadErr) {
      console.error("Upload error:", uploadErr);
      return new Response(JSON.stringify({ error: "Erro no upload: " + uploadErr.message }), { status: 500, headers: corsHeaders });
    }

    // Get public URL
    const { data: urlData } = adminClient.storage.from("chat-media").getPublicUrl(storagePath);
    const publicUrl = urlData.publicUrl;

    // Find and update the message with this media_filename
    const { data: msgs } = await adminClient
      .from("mensagens")
      .select("id, metadata")
      .eq("conversa_id", conversaId)
      .eq("tenant_id", tenantId)
      .contains("metadata", { media_filename: mediaFilename, importado: true })
      .limit(1);

    if (msgs && msgs.length > 0) {
      const msg = msgs[0];
      const updatedMeta = { ...(msg.metadata as Record<string, any>), media_status: "uploaded" };
      await adminClient
        .from("mensagens")
        .update({ conteudo: publicUrl, metadata: updatedMeta })
        .eq("id", msg.id);
    }

    return new Response(JSON.stringify({
      success: true,
      filename: mediaFilename,
      url: publicUrl,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("upload-midia-importada error:", err);
    return new Response(JSON.stringify({ error: "Erro interno: " + (err as Error).message }), {
      status: 500, headers: corsHeaders,
    });
  }
});
