export default function Image({
  src,
  alt,
  priority,
  unoptimized,
  fill,
  quality,
  placeholder,
  blurDataURL,
  ...props
}) {
  const image = typeof src === "string" ? { src } : src
  return (
    <img
      {...image}
      {...props}
      alt={alt}
      loading={priority ? "eager" : props.loading || "lazy"}
      fetchPriority={priority ? "high" : props.fetchPriority}
      style={
        fill
          ? {
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              ...props.style,
            }
          : props.style
      }
    />
  )
}
