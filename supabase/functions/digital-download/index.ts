import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", {headers:cors});
  try {
    const {access_token} = await req.json();
    if(typeof access_token !== "string" || access_token.length < 32) return new Response(JSON.stringify({error:"Accès invalide"}),{status:400,headers:{...cors,"Content-Type":"application/json"}});

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const {data:order,error:orderError}=await supabase
      .from("digital_orders")
      .select("id,product_id,workspace_id,status,access_token,customer_email")
      .eq("access_token",access_token)
      .maybeSingle();

    if(orderError || !order || order.status !== "paid") {
      return new Response(JSON.stringify({error:"Paiement non confirmé ou accès introuvable"}),{status:403,headers:{...cors,"Content-Type":"application/json"}});
    }

    const [{data:product},{data:files},{data:lessons}]=await Promise.all([
      supabase.from("digital_products").select("id,name,product_type,access_days").eq("id",order.product_id).maybeSingle(),
      supabase.from("digital_files").select("id,file_name,storage_path,mime_type,size_bytes").eq("product_id",order.product_id).order("created_at"),
      supabase.from("digital_lessons").select("id,position,title,description,video_url").eq("product_id",order.product_id).order("position"),
    ]);

    const urls=[];
    for(const f of files||[]){
      const {data,error}=await supabase.storage.from("digital-products").createSignedUrl(f.storage_path, 60*60);
      if(!error && data?.signedUrl) urls.push({...f,signed_url:data.signedUrl});
    }

    return new Response(JSON.stringify({product,files:urls,lessons:lessons||[]}),{status:200,headers:{...cors,"Content-Type":"application/json"}});
  } catch(e) {
    return new Response(JSON.stringify({error:e?.message||"Erreur serveur"}),{status:500,headers:{...cors,"Content-Type":"application/json"}});
  }
});
