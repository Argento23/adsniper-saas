import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { WebhookEvent } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  // Movemos la conexión AQUI ADENTRO para que no falle el build de Vercel
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const supabase = createClient(supabaseUrl, supabaseKey);

  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    throw new Error('Please add CLERK_WEBHOOK_SECRET from Clerk Dashboard to .env or .env.local')
  }

  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('Error occured -- no svix headers', { status: 400 })
  }

  const payload = await req.json()
  const body = JSON.stringify(payload);
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: WebhookEvent

  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent
  } catch (err) {
    console.error('Error verifying webhook:', err);
    return new Response('Error occured', { status: 400 })
  }

  if (evt.type === 'user.created') {
    const data = evt.data as any;
    
    const email_addresses = data.email_addresses || [];
    const primary_email_address_id = data.primary_email_address_id;
    const emailData = email_addresses.find((e: any) => e.id === primary_email_address_id) || email_addresses[0];
    const email = emailData?.email_address || '';

    const first_name = data.first_name || '';
    const last_name = data.last_name || '';
    const name = [first_name, last_name].filter(Boolean).join(' ') || 'Nuevo Usuario';

    const { error } = await supabase.from('agency_clients').insert({
      name: name,
      email: email,
      company: 'AdSíntesis',
      status: 'active',
      notes: 'Registrado desde SaaS AdSíntesis vía Clerk'
    });

    if (error) {
      console.error('Error Supabase:', error);
      return new Response('DB Error', { status: 200 })
    }
  }

  return new Response('', { status: 200 })
}
