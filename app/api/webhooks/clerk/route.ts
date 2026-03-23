import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { WebhookEvent } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
  // Configura CLERK_WEBHOOK_SECRET en tu .env.local
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET

  if (!WEBHOOK_SECRET) {
    throw new Error('Please add CLERK_WEBHOOK_SECRET from Clerk Dashboard to .env or .env.local')
  }

  // Obtenemos los headers originados por Svix (Clerk)
  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  // Si no existen los headers, respondemos con error
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('Error occured -- no svix headers', {
      status: 400
    })
  }

  // Obtenemos el payload
  const payload = await req.json()
  const body = JSON.stringify(payload);

  // Instanciamos Svix
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: WebhookEvent

  // Verificamos la petición de Clerk
  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent
  } catch (err) {
    console.error('Error verifying webhook:', err);
    return new Response('Error occured', {
      status: 400
    })
  }

  const { id } = evt.data;
  const eventType = evt.type;

  // Si el evento es la creación de un nuevo usuario en Clerk
  if (eventType === 'user.created') {
    const data = evt.data as any;
    
    // Extraer email
    const email_addresses = data.email_addresses || [];
    const primary_email_address_id = data.primary_email_address_id;
    const emailData = email_addresses.find((e: any) => e.id === primary_email_address_id) || email_addresses[0];
    const email = emailData?.email_address || '';

    // Extraer nombre
    const first_name = data.first_name || '';
    const last_name = data.last_name || '';
    const name = [first_name, last_name].filter(Boolean).join(' ') || 'Usuario Nuevo';

    console.log(`Webhook Triggered: Inserting AdSíntesis user ${email} into agency_clients...`);

    // Insertar en la tabla agency_clients (que se refleja en el panel de GenerArise)
    const { error } = await supabase.from('agency_clients').insert({
      name: name,
      email: email,
      company: 'AdSíntesis', // Identificador clave para el panel
      status: 'active',
      notes: 'Registrado desde SaaS AdSíntesis vía Clerk'
    });

    if (error) {
      console.error('Error al insertar en agency_clients:', error);
      // Even if it fails (e.g. unique constraint on email), return 200 so Clerk doesn't retry infinitely
      return new Response('Error inserting into database: ' + error.message, { status: 200 })
    }
  }

  return new Response('', { status: 200 })
}
