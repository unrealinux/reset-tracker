import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CopyButton } from "@/components/CopyButton";
import { getPrompt, prompts } from "@/lib/content/prompts";
import { localizedPath } from "@/lib/i18n";
import { buildAlternates } from "@/lib/seo";
import { getRequestContext } from "@/lib/server-context";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return prompts.map((prompt) => ({ slug: prompt.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale: requestedLocale, slug } = await params;
  const prompt = getPrompt(slug);
  if (!prompt) return {};
  const { locale } = await getRequestContext(requestedLocale);
  return {
    title: prompt.title,
    description: prompt.teaser,
    alternates: buildAlternates(`/prompts/${prompt.slug}`, locale),
  };
}

export default async function PromptDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale: requestedLocale, slug } = await params;
  const prompt = getPrompt(slug);
  if (!prompt) notFound();

  const { locale, t } = await getRequestContext(requestedLocale);
  const href = (path: string) => localizedPath(path, locale);
  const sameGroup = prompts.filter((p) => p.group === prompt.group && p.slug !== prompt.slug);

  return (
    <section className="doc-layout">
      <aside className="toc">
        <p className="toc__title">{t("prompts.contents")}</p>
        <ul>
          {prompts.map((item) => (
            <li key={item.slug}>
              <Link
                href={href(`/prompts/${item.slug}`)}
                aria-current={item.slug === slug ? "page" : undefined}
              >
                {item.title}
              </Link>
            </li>
          ))}
        </ul>
      </aside>

      <article className="prose">
        <nav className="row tiny muted" aria-label="Breadcrumb" style={{ marginBottom: 8 }}>
          <Link href={href("/prompts")}>{t("prompts.title")}</Link>
          <span>/</span>
          <span>{prompt.group === "project" ? t("prompts.group.project") : t("prompts.group.conversation")}</span>
        </nav>

        <div className="row">
          {prompt.tags.map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </div>

        <h1 className="h1" style={{ fontSize: "clamp(24px,3.2vw,34px)" }}>
          {prompt.title}
        </h1>
        <p className="lead">{prompt.teaser}</p>

        <div className="spread" style={{ margin: "16px 0 8px" }}>
          <h2 style={{ margin: 0 }}>{t("prompts.copy")}</h2>
          <CopyButton
            value={prompt.body}
            label={t("prompts.copy")}
            copiedLabel={t("prompts.copied")}
            className="btn btn--primary btn--sm"
          />
        </div>
        <div className="prompt-body">{prompt.body}</div>

        <h2>{t("wiki.inPractice")}</h2>
        <ul>
          {prompt.notes.map((note, index) => (
            <li key={index}>{note}</li>
          ))}
        </ul>

        <div className="divider" />

        <h3>{t("prompts.group.project")}</h3>
        <ul>
          {sameGroup.slice(0, 4).map((item) => (
            <li key={item.slug}>
              <Link href={href(`/prompts/${item.slug}`)}>{item.title}</Link>
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}
