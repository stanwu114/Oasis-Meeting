/** Oasis 品牌标识:开放的 "O" 及产品线图标(统一 O 基因,不同内部能力图形)。
 *  颜色跟随 currentColor,由外层 color 控制。几何与 assets/brand/*.svg 保持一致。 */

const OPEN_O = (
  <circle cx="24" cy="24" r="15.5" strokeWidth="8.5" strokeDasharray="80.4 17" stroke="currentColor" fill="none" />
)

const VARIANTS: Record<string, React.ReactNode> = {
  /* 主品牌:纯开放 O */
  o: OPEN_O,
  /* Oasis Meeting:O + 声波(录音/转写) */
  meeting: (
    <>
      {OPEN_O}
      <rect x="16" y="18" width="3.5" height="12" rx="1.75" fill="currentColor" />
      <rect x="22.25" y="15.5" width="3.5" height="17" rx="1.75" fill="currentColor" />
      <rect x="28.5" y="18" width="3.5" height="12" rx="1.75" fill="currentColor" />
    </>
  ),
  /* Oasis NoteBook:O + 文本行(笔记) */
  notebook: (
    <>
      {OPEN_O}
      <rect x="15.5" y="18" width="17" height="3" rx="1.5" fill="currentColor" />
      <rect x="15.5" y="22.5" width="17" height="3" rx="1.5" fill="currentColor" />
      <rect x="15.5" y="27" width="11" height="3" rx="1.5" fill="currentColor" />
    </>
  ),
  /* Oasis Harness:O + 节点网络(AI 智能体) */
  harness: (
    <>
      {OPEN_O}
      <path d="M24 24 L24 16.8 M24 24 L16.8 29.2 M24 24 L31.2 29.2" strokeWidth="2" stroke="currentColor" fill="none" />
      <circle cx="24" cy="24" r="2.3" fill="currentColor" />
      <circle cx="24" cy="16.8" r="2.5" fill="currentColor" />
      <circle cx="16.8" cy="29.2" r="2.5" fill="currentColor" />
      <circle cx="31.2" cy="29.2" r="2.5" fill="currentColor" />
    </>
  )
}

export function BrandMark({
  variant = 'o',
  size = 22,
  className
}: {
  variant?: 'o' | 'meeting' | 'notebook' | 'harness'
  size?: number
  className?: string
}): React.ReactNode {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      strokeLinecap="round"
      aria-hidden="true"
    >
      {VARIANTS[variant]}
    </svg>
  )
}
