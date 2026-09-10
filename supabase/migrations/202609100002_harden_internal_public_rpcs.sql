-- RecuVente SaaS — second security hardening pass
-- These functions are internal/authenticated flows, not public storefront APIs.

begin;
revoke execute on function public.abonnement_actif(uuid) from anon;
revoke execute on function public.notifier_nouvelle_commande() from anon;
revoke execute on function public.statistiques_visites(uuid) from anon;
commit;
