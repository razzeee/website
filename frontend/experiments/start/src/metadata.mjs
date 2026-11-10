export function metadataHead(parent, page) {
  const metadata = { ...parent, ...page }
  const titleValue = page.title
  const title =
    typeof titleValue === "string"
      ? parent.title.template.replace("%s", titleValue)
      : titleValue?.absolute ||
        (titleValue?.default
          ? parent.title.template.replace("%s", titleValue.default)
          : parent.title.default)
  const meta = [{ title }]
  const links = []
  const add = (name, content, property = false) => {
    if (content != null) {
      meta.push({
        [property ? "property" : "name"]: name,
        content: String(content),
      })
    }
  }
  const absolute = (url) => new URL(String(url), parent.metadataBase).href
  add("description", metadata.description)
  const robots = metadata.robots
  add(
    "robots",
    typeof robots === "string"
      ? robots
      : robots &&
          [
            robots.index === undefined
              ? null
              : robots.index
                ? "index"
                : "noindex",
            robots.follow === undefined
              ? null
              : robots.follow
                ? "follow"
                : "nofollow",
          ]
            .filter(Boolean)
            .join(", "),
  )
  for (const author of metadata.authors || []) {
    add("author", author.name)
  }
  const og = metadata.openGraph
  const twitter = metadata.twitter
  const images = (value) =>
    value == null ? [] : Array.isArray(value) ? value : [value]
  if (og) {
    for (const [name, value] of Object.entries({
      title: og.title || title,
      description: og.description || metadata.description,
      url: og.url && absolute(og.url),
      site_name: og.siteName,
      locale: og.locale,
      type: og.type,
    })) {
      add(`og:${name}`, value, true)
    }
    for (const image of images(og.images)) {
      add("og:image", absolute(image.url || image), true)
      for (const key of ["width", "height", "alt", "type"]) {
        add(`og:image:${key}`, image[key], true)
      }
    }
  }
  if (twitter) {
    add("twitter:card", twitter.card || "summary")
    add("twitter:title", twitter.title || og?.title || title)
    add(
      "twitter:description",
      twitter.description || og?.description || metadata.description,
    )
    for (const image of images(twitter.images || og?.images)) {
      add("twitter:image", absolute(image.url || image))
      add("twitter:image:alt", image.alt)
      add("twitter:image:width", image.width)
      add("twitter:image:height", image.height)
    }
  }
  if (metadata.alternates?.canonical) {
    links.push({
      rel: "canonical",
      href: absolute(metadata.alternates.canonical),
    })
  }
  for (const [key, rel] of [
    ["icon", "icon"],
    ["apple", "apple-touch-icon"],
  ]) {
    for (const icon of images(metadata.icons?.[key])) {
      links.push(
        typeof icon === "string"
          ? { rel, href: icon }
          : { rel, href: String(icon.url), type: icon.type, sizes: icon.sizes },
      )
    }
  }
  return { meta, links }
}
