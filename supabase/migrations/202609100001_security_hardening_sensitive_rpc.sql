-- RecuVente SaaS — security hardening
-- Sensitive owner/admin RPCs must never be callable by anon.
-- Keep authenticated access where the application legitimately calls them.

begin;

revoke all on function public.depublier_boutique(uuid) from public;
revoke execute on function public.depublier_boutique(uuid) from anon;
grant execute on function public.depublier_boutique(uuid) to authenticated;

revoke all on function public.publier_boutique(uuid,jsonb) from public;
revoke execute on function public.publier_boutique(uuid,jsonb) from anon;
grant execute on function public.publier_boutique(uuid,jsonb) to authenticated;

revoke all on function public.prochain_numero_facture(uuid) from public;
revoke execute on function public.prochain_numero_facture(uuid) from anon;
grant execute on function public.prochain_numero_facture(uuid) to authenticated;

revoke all on function public.traiter_candidature_recrutement(uuid,text,text) from public;
revoke execute on function public.traiter_candidature_recrutement(uuid,text,text) from anon;
grant execute on function public.traiter_candidature_recrutement(uuid,text,text) to authenticated;

revoke all on function public.notifier_owners_admins(uuid,text,text,text,text) from public;
revoke execute on function public.notifier_owners_admins(uuid,text,text,text,text) from anon;
grant execute on function public.notifier_owners_admins(uuid,text,text,text,text) to authenticated;

revoke all on function public.is_member_of_workspace(uuid) from public;
revoke execute on function public.is_member_of_workspace(uuid) from anon;
grant execute on function public.is_member_of_workspace(uuid) to authenticated;

revoke all on function public.is_owner_of_workspace(uuid) from public;
revoke execute on function public.is_owner_of_workspace(uuid) from anon;
grant execute on function public.is_owner_of_workspace(uuid) to authenticated;

revoke all on function public.est_parrain_de(uuid) from public;
revoke execute on function public.est_parrain_de(uuid) from anon;
grant execute on function public.est_parrain_de(uuid) to authenticated;

revoke all on function public.lier_mon_profil_filleul(uuid) from public;
revoke execute on function public.lier_mon_profil_filleul(uuid) from anon;
grant execute on function public.lier_mon_profil_filleul(uuid) to authenticated;

revoke all on function public.enregistrer_mouvement_stock_filleul(uuid,uuid,uuid,text,integer,numeric,uuid,text,text) from public;
revoke execute on function public.enregistrer_mouvement_stock_filleul(uuid,uuid,uuid,text,integer,numeric,uuid,text,text) from anon;
grant execute on function public.enregistrer_mouvement_stock_filleul(uuid,uuid,uuid,text,integer,numeric,uuid,text,text) to authenticated;

revoke all on function public.enregistrer_vente_stock_filleul(uuid,uuid,uuid,integer,numeric,text,text) from public;
revoke execute on function public.enregistrer_vente_stock_filleul(uuid,uuid,uuid,integer,numeric,text,text) from anon;
grant execute on function public.enregistrer_vente_stock_filleul(uuid,uuid,uuid,integer,numeric,text,text) to authenticated;

-- Trigger-only functions: no direct client execution.
revoke all on function public.fn_init_statut_leader() from public;
revoke execute on function public.fn_init_statut_leader() from anon;
revoke all on function public.fn_maj_statut_commissions_filleul() from public;
revoke execute on function public.fn_maj_statut_commissions_filleul() from anon;
revoke all on function public.fn_notifier_commission_validee() from public;
revoke execute on function public.fn_notifier_commission_validee() from anon;
revoke all on function public.fn_notifier_nouveau_filleul() from public;
revoke execute on function public.fn_notifier_nouveau_filleul() from anon;
revoke all on function public.fn_notifier_nouvelle_vente_filleul() from public;
revoke execute on function public.fn_notifier_nouvelle_vente_filleul() from anon;
revoke all on function public.rv_touch_recrutement_updated_at() from public;
revoke execute on function public.rv_touch_recrutement_updated_at() from anon;
revoke all on function public.set_storefront_updated_at() from public;
revoke execute on function public.set_storefront_updated_at() from anon;
revoke all on function public.set_updated_at_sections_accueil() from public;
revoke execute on function public.set_updated_at_sections_accueil() from anon;

commit;