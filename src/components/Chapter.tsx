export function Chapter({
  num,
  kicker,
  title,
  sub,
}: {
  num: string
  kicker: string
  title: string
  sub: string
}) {
  return (
    <div className="chapter">
      <p className="kicker">{kicker}</p>
      <h1>{title}</h1>
      <p className="chapter-sub">{sub}</p>
      <span className="chapter-num" aria-hidden="true">
        {num}
      </span>
    </div>
  )
}
