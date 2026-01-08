import { PageLayout, SharedLayout } from "./quartz/cfg"
import { QuartzPluginData } from "./quartz/plugins/vfile"
import { isFolderPath } from "./quartz/util/path"
import * as Component from "./quartz/components"

function recentNotesFilter(data: QuartzPluginData): boolean {
  return !(data.slug === "index" || isFolderPath(data.slug ?? ""))
}

// components shared across all pages
export const sharedPageComponents: SharedLayout = {
  head: Component.Head(),
  header: [],
  afterBody: [
    Component.ConditionalRender({
      component: Component.RecentNotes({
        limit: 5,
        showTags: false,
        filter: recentNotesFilter,
      }),
      condition: (page) => page.fileData.slug === "index",
    }),
    Component.Comments({
      provider: "giscus",
      options: {
        repo: "loijilai/rwx-blog",
        repoId: "R_kgDOQDsexA",
        category: "Announcements",
        categoryId: "DIC_kwDOQDsexM4CyGyf",
        lang: "zh-TW",
        mapping: "pathname",
        strict: false,
        reactionsEnabled: true,
        inputPosition: "top",
      },
    }),
  ],
  footer: Component.Footer({
    links: {
      GitHub: "https://github.com/loijilai",
    },
  }),
}

// components for pages that display a single page (e.g. a single note)
export const defaultContentPageLayout: PageLayout = {
  beforeBody: [
    Component.ConditionalRender({
      component: Component.Breadcrumbs(),
      condition: (page) => page.fileData.slug !== "index",
    }),
    Component.ArticleTitle(),
    Component.ContentMeta(),
    Component.TagList(),
  ],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        {
          Component: Component.Search(),
          grow: true,
        },
        { Component: Component.Darkmode() },
        { Component: Component.ReaderMode() },
      ],
    }),
    Component.Explorer(),
  ],
  right: [
    Component.Graph(),
    Component.DesktopOnly(Component.TableOfContents()),
    Component.Backlinks(),
  ],
}

// components for pages that display lists of pages  (e.g. tags or folders)
export const defaultListPageLayout: PageLayout = {
  beforeBody: [Component.Breadcrumbs(), Component.ArticleTitle(), Component.ContentMeta()],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        {
          Component: Component.Search(),
          grow: true,
        },
        { Component: Component.Darkmode() },
      ],
    }),
    Component.Explorer(),
  ],
  right: [],
}
