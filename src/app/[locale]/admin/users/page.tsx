import { getTranslations, setRequestLocale } from "next-intl/server";
import { SAMPLE_USERS } from "@/lib/admin/sample-admin-data";

export default async function AdminUsersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin");

  return (
    <div>
      <h2 className="headline text-xl text-ink">{t("tabUsers")}</h2>
      <div className="mt-4 overflow-x-auto rounded-card-lg border border-line bg-white">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-section text-xs font-bold text-ink/70">
            <tr>
              <th className="px-4 py-3">{t("colName")}</th>
              <th className="px-4 py-3">{t("colEmail")}</th>
              <th className="px-4 py-3">{t("colRole")}</th>
              <th className="px-4 py-3">{t("colCity")}</th>
              <th className="px-4 py-3">{t("colSince")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {SAMPLE_USERS.map((user) => (
              <tr key={user.id}>
                <td className="px-4 py-3 font-semibold text-ink">{user.name}</td>
                <td className="px-4 py-3">{user.email}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-mint px-2.5 py-0.5 text-xs font-bold text-forest">
                    {t(`role_${user.role}` as "role_household")}
                  </span>
                </td>
                <td className="px-4 py-3">{user.city}</td>
                <td className="px-4 py-3">{user.createdAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
