export function Thumb({ url, name, size = 40 }: { url: string | null | undefined; name: string; size?: number }) {
  return url ? (
    <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-lg object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="flex shrink-0 items-center justify-center rounded-lg bg-burgundy-soft font-bold text-burgundy" style={{ width: size, height: size }} aria-hidden>
      {name.charAt(0)}
    </span>
  );
}
