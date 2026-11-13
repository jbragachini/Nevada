-- Nevada Producciones
-- 0014: las funciones que solo usan los triggers no se pueden llamar desde afuera
-- (lo marcó el revisor de seguridad de Supabase).
revoke execute on function public.event_guests_tope() from public, anon, authenticated;
revoke execute on function public.ticket_types_cupo_minimo() from public, anon, authenticated;
revoke execute on function public.limitar_reservas_web() from public, anon, authenticated;
revoke execute on function public.set_actualizado_en() from public, anon, authenticated;
revoke execute on function public.audit_log_inmutable() from public, anon, authenticated;
