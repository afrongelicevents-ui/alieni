-- Admin dashboard on real data. Purely additive.

create policy "admin reads payments" on payments for select using (is_admin());
create policy "admin reads invoices" on invoices for select using (is_admin());
create policy "admin reads favourites count" on favourites for select using (is_admin());
create policy "admin reads job responses" on job_responses for select using (is_admin());
create policy "admin updates emergency" on emergency_requests for update using (is_admin());
create policy "admin reads all profiles rows" on profiles for select using (is_admin());
-- settings: admin may add new keys too (not only update existing ones)
create policy "admin inserts settings" on settings for insert with check (is_admin());
