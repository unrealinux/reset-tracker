import Link from "next/link";
import type { Metadata } from "next";
import { CopyButton } from "@/components/CopyButton";
import { promptGroups, prompts, promptsByGroup } from "@/lib/content/prompts";
import { localizedPath } from "@/lib/i18n";
import { buildAlternates } from "@/lib/seo";
import { getRequestContext } from "@/lib/server-context";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const { locale, t } = await getRequestContext(requestedLocale);
  return {
    title: `${t("prompts.title")} — ${t("prompts.sub")}`,
    description: t("prompts.lead"),
    alternates: buildAlternates("/prompts", locale),
  };
}

export default async function PromptsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: requestedLocale } = await params;
  const { locale, t } = await getRequestContext(requestedLocale);
  const href = (path: string) => localizedPath(path, locale);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: t("prompts.sub"),
    description: t("prompts.lead"),
    step: prompts.map((prompt) => ({
      "@type": "HowToStep",
      name: prompt.title,
      text: prompt.teaser,
      url: href(`/prompts/${prompt.slug}`),
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section>
        <p className="eyebrow">{t("prompts.title")}</p>
        <h1 className="h1" style={{ fontSize: "clamp(26px,3.6vw,38px)" }}>
          {t("prompts.sub")}
        </h1>
        <p className="lead">{t("prompts.lead")}</p>
      </section>

      <section className="section doc-layout">
        <aside className="toc">
          <p className="toc__title">{t("prompts.contents")}</p>
          <ul>
            {prompts.map((prompt) => (
              <li key={prompt.slug}>
                <Link href={href(`/prompts/${prompt.slug}`)}>{prompt.title}</Link>
              </li>
            ))}
          </ul>
        </aside>

        <div className="stack" style={{ gap: 26 }}>
          {promptGroups.map((group) => (
            <section key={group.id}>
              <h2 className="h2">{t(group.titleKey)}</h2>
              <p className="muted small" style={{ marginTop: 0 }}>
                {t(group.subKey)}
              </p>
              <div className="stack" style={{ gap: 12, marginTop: 12 }}>
                {promptsByGroup(group.id).map((prompt) => (
                  <article key={prompt.slug} className="card">
                    <div className="spread">
                      <h3 className="h3" style={{ margin: 0 }}>
                        <Link href={href(`/prompts/${prompt.slug}`)}>{prompt.title}</Link>
                      </h3>
                      <CopyButton
                        value={prompt.body}
                        label={t("prompts.copy")}
                        copiedLabel={t("prompts.copied")}
                      />
                    </div>
                    <p className="small muted" style={{ margin: "6px 0 0" }}>
                      {prompt.teaser}
                    </p>
                    <div className="row" style={{ marginTop: 10 }}>
                      {prompt.tags.map((tag) => (
                        <span key={tag} className="tag">
                          {tag}
                        </span>
                      ))}
                      <Link className="link-arrow small" href={href(`/prompts/${prompt.slug}`)}>
                        {t("prompts.read")}
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </>
  );
}
